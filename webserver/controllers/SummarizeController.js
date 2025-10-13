/**
 * SummarizeController.js
 * Handles the /summarize route with DB-backed caching (text_hash + user_id),
 * timestamped logging with component prefix, and debug toggle.
 *
 * Changelog (Aug 2025):
 * - NEW: Cache lookup by (text_hash, user_id) with early return on hit
 * - NEW: Optional forceRefresh to bypass cache
 * - NEW: Persist summaries on miss
 * - NEW: Timestamped logs with component prefix; toggle via DEBUG_LOGS env var
 * - Logging tags used inside messages: [CACHE], [LLM], [DB], [ERROR], [WEB]
 *
 * Known constraints:
 * - MySQL 5.5 project style (latin1, backticks, DATETIME 'created', NOW() on insert)
 * - Node v14, using node-fetch
 */

// Dependencies (Node 14 compatible)
const fetch = require('node-fetch');
const crypto = require('crypto');
const createLogger = require('../utils/logger');

const logger = createLogger('SummarizeController');

module.exports = function(connection, app, passport, io) {
  const SummaryModel = require('../models/SummaryModel')(connection);
  // Allow cookie-session OR Basic header
  function authAny(req, res, next) {
    if (req.user) return next();
    return passport.authenticate('basic', { session: false })(req, res, next);
  }
  app.post('/summarize', authAny, async function(req, res) {
    logger.info("[WEB] Received /summarize request");

    try {
      // --- 1) Validate payload ------------------------------------------------
      // Keep body access minimal and explicit for clarity
      const body = req.body || {};
      let text = typeof body.text === 'string' ? body.text : null;      // <-- may be null; we'll recover from DB if possible
      const url = typeof body.url === 'string' ? body.url : null;
      const providedTextHash = (typeof body.text_hash === 'string' && body.text_hash.length === 64) ? body.text_hash : null;
      const forceRefresh = body.forceRefresh === true || body.forceRefresh === 'true';

      // --- 2) Resolve user scope (Basic Auth) --------------------------------
      const userId = (req.user && req.user.id) ? req.user.id : null;
      if (!userId) {
        logger.warn("Missing user_id on request context (Basic Auth)");
      }

      // --- 2.5) Recover raw_text from DB if text is missing -------------------
      if (!text) {
        try {
          const recovered = await SummaryModel.recoverRawText({ userId, url, textHash: providedTextHash });
          if (recovered) {
            text = recovered;
            logger.debug("[CACHE][RAW] recovered raw_text from DB for regenerate");
          } else {
            logger.error("Missing 'text' in request and no cached raw_text found (need either text or prior cache)");
            return res.status(400).json({ error: "Missing 'text' and no cached raw_text found for given url/text_hash" });
          }
        } catch (e) {
          logger.error("[DB] raw_text recovery failed:", e);
          return res.status(500).json({ error: "Failed to recover raw text" });
        }
      }

      // --- 3) Compute cache key (text_hash) ----------------------------------
      // SHA-256 hex over the article text (lowercase hex, 64 chars). We compute after potential recovery.
      const textHash = crypto.createHash('sha256').update(text, 'utf8').digest('hex');


      // --- 4) Cache lookup (early return on hit unless forceRefresh) ----------
      if (!forceRefresh && userId) {
        try {
          const cachedRow = await SummaryModel.getCachedSummary(textHash, userId);

          if (cachedRow) {
            logger.debug("[CACHE] hit");
            return res.json({
              summary: cachedRow.summary,
              fromCache: true,
              edited: !!cachedRow.edited,
              editedAt: cachedRow.edited_at || null
            });
          } else {
            logger.debug("[CACHE] miss");
          }
        } catch (lookupErr) {
          // Defensive catch; proceed to NLP
          logger.error("Unexpected during cache lookup:", lookupErr);
        }
      } else if (forceRefresh) {
        logger.info("[CACHE] bypass via forceRefresh");
      } else {
        logger.debug("[CACHE] miss (no userId for scoped cache)");
      }

      // --- 5) NLP call on miss/bypass ----------------------------------------
      let summary = null;
      try {
        logger.info("[LLM] calling NLP server...");
        const tNlp = logger.timer('summarize_nlp', { userId });
        const nlpResponse = await fetch(`${process.env.CORENLP_HOST}/summary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });

        if (!nlpResponse.ok) {
          logger.error( `[LLM] NLP server status ${nlpResponse.status}`);
          tNlp.end({ ok: false, status: nlpResponse.status });
          return res.status(502).json({ error: "NLP server error" });
        }

        const nlpData = await nlpResponse.json();
        summary = nlpData && typeof nlpData.summary === 'string' ? nlpData.summary : null;

        if (!summary) {
          logger.error("[LLM] Empty summary from NLP server");
          tNlp.end({ ok: false, empty: true });
          return res.status(502).json({ error: "Empty summary from NLP server" });
        }
        logger.info("[LLM] created summary");
        tNlp.end({ ok: true });
      } catch (err) {
        logger.error("[LLM] request failed:", err);
        return res.status(502).json({ error: "Failed to summarize text" });
      }

      // --- 6) Persist summary (best-effort) ---
      // Project style: 'created' DATETIME set via NOW() on write.
      try {
        if (userId) {
          const useUpsert = !!forceRefresh;
          const rawText = text || null; // falls du raw_text mit speicherst

          if (useUpsert) {
            await SummaryModel.upsertSummary({ textHash, userId, url: url || null, rawText, summary });
            logger.debug("[DB] summary upserted (forceRefresh), edited reset");
          } else {
            await SummaryModel.insertSummary({ textHash, userId, url: url || null, rawText, summary });
            logger.debug("[DB] summary saved, edited reset");
          }
        } else {
          logger.warn("[DB] skipped write: missing userId");
        }
      } catch (insErr) {
        logger.error("Unexpected during DB write:", insErr);
        // Non-blocking
      }

      // --- 7) Response --------------------------------------------------------
      return res.json({ summary, fromCache: false, edited: false, editedAt: null });

    } catch (outerErr) {
      logger.error("summarize handler failed:", outerErr);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  /**
   * Edit an existing summary (user-scoped).
   * Body: { text_hash? (preferred) OR url, summary }
   * Effect: updates the row and sets edited=1, edited_at=NOW()
   */
  app.post('/summary/edit', authAny, async function(req, res) {
    try {
      const userId = (req.user && req.user.id) ? req.user.id : null;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const body = req.body || {};
      const newSummary = (typeof body.summary === 'string') ? body.summary : null;
      const textHash = (typeof body.text_hash === 'string' && body.text_hash.length === 64) ? body.text_hash : null;
      const url = (typeof body.url === 'string') ? body.url : null;

      if (!newSummary || (!textHash && !url)) {
        return res.status(400).json({ error: "Provide 'summary' and either 'text_hash' or 'url'." });
      }
      const changed = await SummaryModel.updateSummary({ userId, textHash, url, summary: newSummary });

      if (!changed) {
        return res.status(404).json({ error: "Summary not found for update" });
      }

      return res.json({ ok: true, edited: true });
    } catch (e) {
      logger.error("POST /summary/edit failed:", e);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

};
