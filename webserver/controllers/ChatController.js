// webserver/controllers/ChatController.js
/**
 * (old commentary)
 * ChatController.js
 * POST /chat → fetch article context from DB (by user_id + url), handle sessions, proxy to NLP, and persist both messages.
 *
 * Request (from plugin/SW):
 *   { question: string, url: string, sessionId?: number|null, scope?: string, context?: string }
 *
 * Response:
 *   NLP JSON passthrough + { sessionId }
 */

const fetch = require('node-fetch');
const createLogger = require('../utils/logger');

const logger = createLogger('ChatController');

module.exports = function(connection, app, passport /*, io */) {
  const ChatModel = require('../models/ChatModel')(connection);

  /**
   * Allow cookie-session OR Basic header for this request.
   * - If user is already deserialized (cookie), continue.
   * - Else try one-shot Basic without session persistence.
   */
  function authAny(req, res, next) {
    if (req.user) return next();
    return passport.authenticate('basic', { session: false })(req, res, next);
  }

  /**
   * Append a regenerated assistant message for a session using the same context mechanism as /chat.
   * @param {object} p
   * @param {number} p.userId
   * @param {number} p.sessionId
   * @param {'current'|'domain'|'recent'|'manual'} p.ctxMode
   * @param {string|null} p.url
   * @param {number[]|null} p.selectedIds
   * @param {number|undefined} p.ctxCount
   * @param {{ models:any }} p.deps
   * @returns {Promise<number>} newly created assistant message id
   */
  async function regenerateAssistantForSession({ userId, sessionId, ctxMode, url, selectedIds, ctxCount}) {
    // ---- Limits (env-configurable; mirrors /chat defaults) ----
    const MAX_HISTORY            = Number(process.env.MAX_CHAT_HISTORY || 20);
    const CTX_MAX_ARTICLES       = Number(process.env.CTX_MAX_ARTICLES || 7);
    const CTX_PER_ARTICLE_CHARS  = Number(process.env.CTX_PER_ARTICLE_CHARS || 33000);
    const CTX_TOTAL_MAX_CHARS    = Number(process.env.CTX_TOTAL_MAX_CHARS || 100000);
    const NLP_BASE_URL           = `${process.env.CORENLP_HOST}` || 'http://host.docker.internal:9000';

    function cut(s, n) {
      if (!s) return '';
      const str = String(s);
      return (str.length <= n) ? str : (str.slice(0, n) + ' …');
    }

    // ---- 1) Ownership + minimal meta guard ----
    const meta = await ChatModel.getSessionMeta(sessionId, userId);
    if (!meta) {
      throw Object.assign(new Error('Session not found or forbidden'), { code: 403 });
    }

    // ---- 2) Load history & extract latest user "question" ----
    const history = await ChatModel.getSessionHistory({ sessionId, userId, limit: MAX_HISTORY });
    if (!Array.isArray(history) || history.length === 0) {
      throw Object.assign(new Error('Empty history'), { code: 400 });
    }
    // latest user message content (scan from end)
    let question = '';
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i]?.role === 'user' && (history[i].content || '').trim()) {
        question = history[i].content.trim();
        break;
      }
    }
    if (!question) {
      throw Object.assign(new Error('No user message found to regenerate from'), { code: 400 });
    }

    // Build messages array from history as-is (no extra user push)
    const messages = history.map(m => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user'),
      content: m.content || ''
    }));

    // ---- 3) Build context text (mirrors /chat logic) ----
    const mode = (ctxMode || 'current');
    let ctxText = '';

    // helper that composes multi-article context with truncation
    async function buildMultiContext({ mode, baseUrl, ids }) {
      const parts = [];
      let host = null;
      try { host = baseUrl ? new URL(baseUrl).hostname : null; } catch(_) {}

      // determine how many items to fetch
      const effLimit = Math.min(
        Math.max(1, Number(ctxCount || CTX_MAX_ARTICLES) || CTX_MAX_ARTICLES),
        CTX_MAX_ARTICLES
      );

      // fetch candidates
      let items = [];
      if (mode === 'domain') {
        items = await ChatModel.listRecentArticlesWithText({ userId, limit: effLimit, host });
      } else if (mode === 'recent') {
        items = await ChatModel.listRecentArticlesWithText({ userId, limit: effLimit, host: null });
      } else if (mode === 'manual') {
        items = await ChatModel.getArticlesByIdsWithText({ userId, ids: Array.isArray(ids) ? ids : [] });
      } else {
        // current handled below
        return '';
      }

      // concatenate with caps
      let total = 0;
      let idx = 0;
      for (const it of items) {
        if (!it || !it.text) continue;
        const header = `=== Source ${++idx}: ${it.url} (${it.created}) ===\n`;
        const chunk  = cut(it.text, CTX_PER_ARTICLE_CHARS);
        let piece    = header + chunk + '\n\n';
        if (total + piece.length > CTX_TOTAL_MAX_CHARS) {
          const room = Math.max(0, CTX_TOTAL_MAX_CHARS - total);
          piece = piece.slice(0, room);
          parts.push(piece);
          break;
        }
        parts.push(piece);
        total += piece.length;
        if (parts.length >= CTX_MAX_ARTICLES) break;
      }
      return parts.join('').trim();
    }

    if (mode === 'current') {
      if (!url || !url.trim()) {
        // fall back to empty ctx if URL missing
        ctxText = '';
      } else {
        // getContextByUrl returns the RAW TEXT (string), not an object
        const raw = await ChatModel.getContextByUrl(url.trim(), userId);
        ctxText = raw ? cut(raw, CTX_PER_ARTICLE_CHARS) : '';
      }
    } else {
      ctxText = await buildMultiContext({ mode, baseUrl: url || null, ids: selectedIds || [] });
    }

    // ---- 4) NLP call ----
    const tNlp = logger.timer('chat_nlp_regenerate', { sessionId, userId });
    const nlpResp = await fetch(`${NLP_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        context: ctxText || '',
        url: url || '',
        scope: mode,
        messages
      })
    });

    if (!nlpResp.ok) {
      let details = null; try { details = await nlpResp.json(); } catch {}
      tNlp.end({ ok: false, status: nlpResp.status });
      throw Object.assign(new Error('NLP server error'), { code: 502, details });
    }

    let nlpData = null;
    try { nlpData = await nlpResp.json(); }
    catch (e) {
      tNlp.end({ ok: false, parse: 'json' });
      throw Object.assign(new Error('Invalid JSON from NLP server'), { code: 502 });
    }
    tNlp.end({ ok: true });

    // ---- 5) Persist assistant message ----
    const assistantText =
      (typeof nlpData?.answer === 'string' && nlpData.answer.length > 0)
        ? nlpData.answer
        : JSON.stringify(nlpData);

    const inserted = await ChatModel.addMessage({
      sessionId,
      userId,
      role: 'assistant',
      content: assistantText
    });

    const newId = Number(inserted?.id || 0);
    if (!newId) {
      // Not fatal, but signal unexpected
      throw Object.assign(new Error('Assistant message not persisted'), { code: 500 });
    }
    return newId;
  }

  // --- list recent article candidates for manual selection
  app.get('/chat/contexts/recent',
    authAny,
    async function(req, res) {
      try {
        const userId = req?.user?.id;
        const limit  = Number(req.query.limit || 50);
        const host   = (typeof req.query.host === 'string' && req.query.host.trim()) ? req.query.host.trim() : null;

        const rows = await ChatModel.listRecentArticlesMeta({ userId, limit, host });
        return res.json({ items: rows });
      } catch (e) {
        logger.error('recent context query failed', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // --- Preview resolved context (no NLP call, no persistence)
  // POST /chat/context/preview
  // Body: { url: string, contextMode: 'current'|'domain'|'recent'|'manual', selectedIds?: number[], ctxCount?: number, context?: string }
  app.post('/chat/context/preview',
    authAny,
    async function(req, res) {
      try {
        const userId = req?.user?.id || null;
        const body = req.body || {};
        const url  = (typeof body.url === 'string') ? body.url.trim() : '';
        const mode = (typeof body.contextMode === 'string') ? body.contextMode : 'current';
        const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds : [];
        const ctxCountReq = Number(body.ctxCount || 0);
        const overrideContext = (typeof body.context === 'string') ? body.context : null;

        // Limits (align with /chat defaults)
        const CTX_MAX_ARTICLES       = Number(process.env.CTX_MAX_ARTICLES || 7);
        const CTX_PER_ARTICLE_CHARS  = Number(process.env.CTX_PER_ARTICLE_CHARS || 33000);
        const CTX_TOTAL_MAX_CHARS    = Number(process.env.CTX_TOTAL_MAX_CHARS || 100000);

        function cut(s, n) {
          if (!s) return '';
          const str = String(s);
          return (str.length <= n) ? str : (str.slice(0, n) + ' …');
        }

        async function buildMultiContext({ mode, baseUrl, ids }) {
          const parts = [];
          const sources = [];
          let host = null;
          try { host = new URL(baseUrl).hostname; } catch(_) {}

          const effLimit = Math.min(
            Math.max(1, Number(ctxCountReq || CTX_MAX_ARTICLES) || CTX_MAX_ARTICLES),
            CTX_MAX_ARTICLES
          );

          let items = [];
          if (mode === 'domain') {
            items = await ChatModel.listRecentArticlesWithText({ userId, limit: effLimit, host });
          } else if (mode === 'recent') {
            items = await ChatModel.listRecentArticlesWithText({ userId, limit: effLimit, host: null });
          } else if (mode === 'manual') {
            items = await ChatModel.getArticlesByIdsWithText({ userId, ids: Array.isArray(ids) ? ids : [] });
          } else {
            return { text: '', sources };
          }

          let total = 0;
          let idx = 0;
          for (const it of items) {
            if (!it || !it.text) continue;
            const header = `=== Source ${++idx}: ${it.url} (${it.created}) ===\n`;
            const chunk  = cut(it.text, CTX_PER_ARTICLE_CHARS);
            let piece    = header + chunk + '\n\n';
            if (total + piece.length > CTX_TOTAL_MAX_CHARS) {
              const room = Math.max(0, CTX_TOTAL_MAX_CHARS - total);
              piece = piece.slice(0, room);
              parts.push(piece);
              sources.push({ url: it.url, created: it.created, length: piece.length });
              break;
            }
            parts.push(piece);
            total += piece.length;
            sources.push({ url: it.url, created: it.created, length: piece.length });
          }
          return { text: parts.join('').trim(), sources };
        }

        let ctxText = '';
        let sources = [];

        if (mode === 'current') {
          if (overrideContext && overrideContext.trim().length > 0) {
            ctxText = cut(overrideContext.trim(), CTX_PER_ARTICLE_CHARS);
            sources = url ? [{ url, created: null, length: ctxText.length }] : [];
          } else if (url && url.trim()) {
            const raw = await ChatModel.getContextByUrl(url.trim(), userId);
            if (!raw) return res.status(404).json({ error: 'No article context' });
            ctxText = cut(raw, CTX_PER_ARTICLE_CHARS);
            sources = [{ url, created: null, length: ctxText.length }];
          } else {
            ctxText = '';
          }
        } else {
          const out = await buildMultiContext({ mode, baseUrl: url || null, ids: selectedIds || [] });
          ctxText = out.text || '';
          sources = out.sources || [];
        }

        return res.json({ mode, context: ctxText || '', sources, totalChars: (ctxText || '').length });
      } catch (e) {
        logger.error('context preview failed', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // --- /chat post handler
  app.post('/chat',
    authAny,
    async function(req, res) {
      try {
        const body = req.body || {};
        const question   = (typeof body.question === 'string') ? body.question.trim() : '';
        const url        = (typeof body.url === 'string') ? body.url.trim() : '';
        const scope      = (typeof body.scope === 'string') ? body.scope : 'current';
        const sessionIdIn = (body.sessionId == null || typeof body.sessionId === 'number')
          ? (body.sessionId ?? null) : null;
        const userId     = req?.user?.id || null;

        // context selection
        const contextMode = (typeof body.contextMode === 'string') ? body.contextMode : 'current'; // 'current'|'domain'|'recent'|'manual'
        const ctxCountReq = Number(body.ctxCount || 0);
        const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds : [];

        logger.info('request /chat received', { userId, url, q_len: question.length, scope, sessionId: sessionIdIn, contextMode, selCount: selectedIds.length });

        if (!question) return res.status(400).json({ error: "Missing 'question'." });
        if (!url)      return res.status(400).json({ error: "Missing 'url'." });
        if (!userId)   logger.warn('missing userId on request context');

        // ---------- 1) Context Resolve (by contextMode) ----------
        // Limits (env-configurable)
        const CTX_MAX_ARTICLES       = Number(process.env.CTX_MAX_ARTICLES || 7);
        const CTX_PER_ARTICLE_CHARS  = Number(process.env.CTX_PER_ARTICLE_CHARS || 33000);
        const CTX_TOTAL_MAX_CHARS    = Number(process.env.CTX_TOTAL_MAX_CHARS || 100000);

        function cut(s, n) {
          if (!s) return '';
          const str = String(s);
          return (str.length <= n) ? str : (str.slice(0, n) + ' …');
        }

        // Build combined context string from multiple articles
        async function buildMultiContext({ mode, baseUrl, ids }) {
          const parts = [];
          let host = null;
          try { host = new URL(baseUrl).hostname; } catch(_) {}
          // fetch candidates by mode
          let items = [];
          if (mode === 'domain') {
            const effLimit = Math.min(Math.max(1, ctxCountReq || CTX_MAX_ARTICLES), CTX_MAX_ARTICLES);
            items = await ChatModel.listRecentArticlesWithText({ userId, limit: effLimit, host });
          } else if (mode === 'recent') {
            const effLimit = Math.min(Math.max(1, ctxCountReq || CTX_MAX_ARTICLES), CTX_MAX_ARTICLES);
            items = await ChatModel.listRecentArticlesWithText({ userId, limit: effLimit, host: null });
          } else if (mode === 'manual') {
            items = await ChatModel.getArticlesByIdsWithText({ userId, ids: ids || [] });
          } else {
            // current handled outside
            return '';
          }

          let total = 0;
          let idx = 0;
          for (const it of items) {
            if (!it || !it.text) continue;
            const header = `=== Source ${++idx}: ${it.url} (${it.created}) ===\n`;
            const chunk  = cut(it.text, CTX_PER_ARTICLE_CHARS);
            let piece = header + chunk + '\n\n';
            if (total + piece.length > CTX_TOTAL_MAX_CHARS) {
              // trim last piece to fit
              const room = Math.max(0, CTX_TOTAL_MAX_CHARS - total);
              piece = piece.slice(0, room);
              parts.push(piece);
              break;
            }
            parts.push(piece);
            total += piece.length;
            if (parts.length >= CTX_MAX_ARTICLES) break;
          }
          return parts.join('').trim();
        }

        let ctxText = '';
        if (contextMode === 'current') {
          const hasBodyContext = (typeof body.context === 'string' && body.context.trim().length > 0);
          if (hasBodyContext) {
            ctxText = body.context.trim();
          } else {
            ctxText = await ChatModel.getContextByUrl(url, userId) || '';
          }
          if (!ctxText || ctxText.trim().length === 0) {
            return res.status(404).json({
              error: 'No article context'
            });
          }
        } else {
          ctxText = await buildMultiContext({ mode: contextMode, baseUrl: url, ids: selectedIds });
          if (!ctxText) {
            logger.debug('context build empty', { contextMode });
          }
        }

        // ---------- 2) Session handling (unchanged from our earlier version) ----------
        let sessionId = sessionIdIn;
        if (sessionId == null) {
          let title = null;
          try { const u = new URL(url); title = u.hostname || 'Neue Sitzung'; } catch { title = 'Neue Sitzung'; }
          const { id } = await ChatModel.createSession({ userId, title });
          sessionId = id;
          logger.debug('session saved', { sessionId });
        } else {
          const ok = await ChatModel.ensureSessionOwnership({ sessionId, userId });
          if (!ok) {
            logger.warn('session ownership mismatch', { sessionId, userId });
            return res.status(403).json({ error: 'Invalid sessionId for this user.' });
          }
        }

        // ---------- 3) History + messages ----------
        const MAX_HISTORY = Number(process.env.MAX_CHAT_HISTORY || 20);
        let history = [];
        try {
          history = await ChatModel.getSessionHistory({ sessionId, userId, limit: MAX_HISTORY });
        } catch (e) {
          logger.warn('history load failed (continuing)', e);
        }

        const messages = history.map(m => ({
          role: (m.role === 'assistant' ? 'assistant' : 'user'),
          content: m.content
        }));

        // avoid immediate duplicate of last user line
        const last = history[history.length - 1];
        if (!(last && last.role === 'user' && (last.content || '').trim() === question.trim())) {
          messages.push({ role: 'user', content: question });
        }

        // ---------- 4) Persist user message BEFORE NLP ----------
        try {
          await ChatModel.addMessage({ sessionId, userId, role: 'user', content: question });
          logger.debug('message stored', { role: 'user' });
        } catch (e) {
          logger.warn('message insert failed (user)', e);
        }

        // ---------- 5) NLP call ----------
        const NLP_BASE_URL = process.env.NLP_BASE_URL || 'http://host.docker.internal:9000';
        const tNlp = logger.timer('chat_nlp', { sessionId, userId });
        const nlpResp = await fetch(`${NLP_BASE_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            context: ctxText || '',  // big concatenated context (or empty)
            url,
            scope,
            messages              // history + current user msg (server fixed to mix context correctly)
          })
        });

        if (!nlpResp.ok) {
          const status = nlpResp.status;
          let errJson = null; try { errJson = await nlpResp.json(); } catch {}
          logger.error('nlp request failed', { status, detail: errJson || {} });
          tNlp.end({ ok: false, status });
          return res.status(502).json({ error: 'NLP server error', status, details: errJson || null, sessionId });
        }

        let nlpData = null;
        try { nlpData = await nlpResp.json(); }
        catch (e) {
          logger.error('nlp response parse failed', e);
          tNlp.end({ ok: false, parse: 'json' });
          return res.status(502).json({ error: 'Invalid JSON from NLP server', sessionId });
        }
        tNlp.end({ ok: true });

        // ---------- 6) Persist assistant message ----------
        const assistantText =
          typeof nlpData?.answer === 'string' && nlpData.answer.length > 0
            ? nlpData.answer
            : JSON.stringify(nlpData);

        try {
          await ChatModel.addMessage({ sessionId, userId, role: 'assistant', content: assistantText });
          logger.debug('message stored', { role: 'assistant' });
        } catch (e) {
          logger.warn('message insert failed (assistant)', e);
        }

        // ---------- 7) Return payload + sessionId ----------
        logger.info('chat response ready', { sessionId });
        return res.json({ ...nlpData, sessionId });

      } catch (e) {
        logger.error('chat handler failed', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // GET /chat/sessions  → Liste der Sessions des Users
  app.get('/chat/sessions',
    authAny,
    async function(req, res) {
      try {
        const userId = req?.user?.id;
        const limit = Number(req.query.limit || 50);
        const rows = await ChatModel.listSessions(userId, limit);
        return res.json({ sessions: rows });
      } catch (e) {
        logger.error('list sessions failed', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // GET /chat/sessions/:id  → Session-Meta + Verlauf (älteste → neueste)
  app.get('/chat/sessions/:id',
    authAny,
    async function(req, res) {
      try {
        const userId = req?.user?.id;
        const sessionId = Number(req.params.id);
        if (!sessionId) return res.status(400).json({ error: 'Invalid session id' });

        const meta = await ChatModel.getSessionMeta(sessionId, userId);
        if (!meta) return res.status(404).json({ error: 'Session not found' });

        const history = await ChatModel.getSessionHistory({ sessionId, userId, limit: 1000 });
        return res.json({ session: meta, messages: history });
      } catch (e) {
        logger.error('session history fetch failed', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // PATCH /chat/sessions/:id  → rename session
  app.patch('/chat/sessions/:id',
    authAny,
    async (req, res) => {
      try {
        const userId = req.user.id;
        const sessionId = Number(req.params.id);
        const title = (req.body?.title || '').trim();

        if (!sessionId) return res.status(400).json({ error: 'Invalid session id' });
        if (!title)     return res.status(400).json({ error: 'Title must not be empty' });

        const renamed = await ChatModel.renameSession(userId, sessionId, title);
        if (!renamed) return res.status(403).json({ error: 'Forbidden or not found' });

        logger.info('session renamed', { sessionId, title });
        return res.json({ success: true, session: renamed });
      } catch (e) {
        logger.error('rename session failed', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // DELETE /chat/sessions/:id  → delete session (messages removed via FK CASCADE)
  app.delete('/chat/sessions/:id',
    authAny,
    async (req, res) => {
      try {
        const userId = req.user.id;
        const sessionId = Number(req.params.id);

        if (!sessionId) return res.status(400).json({ error: 'Invalid session id' });

        const ok = await ChatModel.deleteSession(userId, sessionId);
        if (!ok) return res.status(403).json({ error: 'Forbidden or not found' });

        logger.info('session deleted', { sessionId });
        return res.json({ success: true });
      } catch (e) {
        logger.error('delete session failed', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // PATCH /chat/messages/:id  → edit a user message and (optionally) regenerate assistant reply
  app.patch('/chat/messages/:id',
    authAny,
    async (req, res) => {
      try {
        const userId = req.user.id;
        const messageId = Number(req.params.id);
        const content = (req.body?.content || '').trim();
        const resend  = !!req.body?.resend;

        // Context-related optional inputs (mirroring existing /chat payload shape)
        const ctxMode    = req.body?.contextMode || req.body?.scope || 'current';
        const url        = req.body?.url || null;
        const selectedIds= Array.isArray(req.body?.selectedIds) ? req.body.selectedIds : null;
        const ctxCount   = Number(req.body?.ctxCount) || undefined;

        if (!messageId) return res.status(400).json({ error: 'Invalid message id' });
        if (!content)   return res.status(400).json({ error: 'Content must not be empty' });

        // Ownership + role check
        const meta = await ChatModel.getMessageMeta(messageId, userId);
        if (!meta)                   return res.status(404).json({ error: 'Message not found' });
        if (meta.role !== 'user')    return res.status(403).json({ error: 'Only user messages can be edited' });

        // Update message content
        const updated = await ChatModel.updateMessageContent(userId, messageId, content);
        if (!updated) return res.status(403).json({ error: 'Forbidden or not found' });

        logger.info('message edit accepted', { messageId });

        // session id from meta
        const sessionId = Number(meta.session_id);

        // Always truncate history after the edited message to keep consistency
        // (remove ALL subsequent messages: user and assistant)
        try {
          const removedAll = await ChatModel.deleteMessagesAfterId(userId, sessionId, messageId);
          if (removedAll > 0) {
            logger.debug('truncated messages after edited message', { messageId, removedAll });
          }
        } catch (e) {
          logger.error('history truncation failed', e);
          // Continue to avoid blocking user; state may be reconciled by subsequent loads
        }

        // Optionally regenerate assistant reply (append a new assistant message)
        if (resend) {
          try {
            const newAssistantId = await regenerateAssistantForSession({
              userId,
              sessionId,
              ctxMode,
              url,
              selectedIds,
              ctxCount
            });
            logger.info('assistant regenerated', { messageId, newAssistantId });
          } catch (e) {
            logger.error('assistant regenerate failed', e);
            // Decide on error code: 502 (bad gateway) if NLP down, else 500
            return res.status(502).json({ error: 'LLM/NLP service unavailable' });
          }
        }

        // Return full, updated history
        const messages = await ChatModel.getSessionHistory({ sessionId, userId, limit: 1000 });
        return res.json({ success: true, sessionId, messages });
      } catch (e) {
        logger.error('edit message failed', e);
        return res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

};







