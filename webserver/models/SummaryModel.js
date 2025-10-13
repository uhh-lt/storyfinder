// webserver/models/SummaryModel.js
/**
 * SummaryModel.js
 * Encapsulates DB access for summaries table.
 *
 * Public API:
 *  - getCachedSummary(textHash, userId)
 *  - recoverRawText({ userId, url, textHash })
 *  - insertSummary({ textHash, userId, url, rawText, summary })
 *  - upsertSummary({ textHash, userId, url, rawText, summary })
 *  - updateSummary({ userId, textHash, url, summary })
 */

module.exports = function(connection /*, models */) {
  async function getCachedSummary(textHash, userId) {
    if (!textHash || !userId) return null;
    return new Promise((resolve) => {
      const sql = "SELECT `summary`, `edited`, `edited_at` FROM `summaries` WHERE `text_hash` = ? AND `user_id` = ? LIMIT 1";
      connection.query(sql, [textHash, userId], (err, rows) => {
        if (err) return resolve(null);
        if (rows && rows.length > 0) return resolve(rows[0]);
        resolve(null);
      });
    });
  }

  /**
   * Recover raw_text for a user either by text_hash or by url (latest).
   * @returns {Promise<string|null>}
   */
  async function recoverRawText({ userId, url, textHash }) {
    return new Promise((resolve, reject) => {
      if (!userId) return resolve(null);

      let sql, params;
      if (textHash && textHash.length === 64) {
        sql = "SELECT `raw_text` FROM `summaries` WHERE `text_hash`=? AND `user_id`=? LIMIT 1";
        params = [textHash, userId];
      } else if (url) {
        sql = "SELECT `raw_text` FROM `summaries` WHERE `url`=? AND `user_id`=? ORDER BY `created` DESC LIMIT 1";
        params = [url, userId];
      } else {
        return resolve(null);
      }

      connection.query(sql, params, (err, rows) => {
        if (err) return reject(err);
        if (rows && rows.length > 0 && typeof rows[0].raw_text === 'string' && rows[0].raw_text.length > 0) {
          return resolve(rows[0].raw_text);
        }
        resolve(null);
      });
    });
  }

  async function insertSummary({ textHash, userId, url = null, rawText = null, summary }) {
    if (!textHash || !userId || !summary) return;
    return new Promise((resolve) => {
      const sql =
        "INSERT INTO `summaries` (`text_hash`, `user_id`, `url`, `raw_text`, `summary`, `edited`, `edited_at`, `created`) " +
        "VALUES (?, ?, ?, ?, ?, 0, NULL, NOW())";
      const params = [textHash, userId, url, rawText, summary];
      connection.query(sql, params, (err) => {
        if (err) {
          // Ignore duplicates (race), otherwise just resolve (best-effort persistence)
          if (err.code === 'ER_DUP_ENTRY') return resolve();
          return resolve();
        }
        resolve();
      });
    });
  }

  async function upsertSummary({ textHash, userId, url = null, rawText = null, summary }) {
    if (!textHash || !userId || !summary) return;
    return new Promise((resolve) => {
      const sql =
        "INSERT INTO `summaries` (`text_hash`, `user_id`, `url`, `raw_text`, `summary`, `edited`, `edited_at`, `created`) " +
        "VALUES (?, ?, ?, ?, ?, 0, NULL, NOW()) " +
        "ON DUPLICATE KEY UPDATE `summary`=VALUES(`summary`), `url`=VALUES(`url`), `raw_text`=VALUES(`raw_text`), `edited`=0, `edited_at`=NULL, `created`=NOW()";
      const params = [textHash, userId, url, rawText, summary];
      connection.query(sql, params, () => resolve());
    });
  }

  /**
   * Update summary text (marks edited=1, edited_at=NOW()).
   * Caller must provide either textHash or url.
   * @returns {Promise<boolean>} whether a row was updated
   */
  async function updateSummary({ userId, textHash = null, url = null, summary }) {
    if (!userId || !summary || (!textHash && !url)) return false;
    return new Promise((resolve, reject) => {
      let sql, params;
      if (textHash) {
        sql = "UPDATE `summaries` SET `summary`=?, `edited`=1, `edited_at`=NOW() WHERE `text_hash`=? AND `user_id`=? LIMIT 1";
        params = [summary, textHash, userId];
      } else {
        sql = "UPDATE `summaries` SET `summary`=?, `edited`=1, `edited_at`=NOW() WHERE `url`=? AND `user_id`=? ORDER BY `created` DESC LIMIT 1";
        params = [summary, url, userId];
      }
      connection.query(sql, params, (err, result) => {
        if (err) return reject(err);
        resolve(result && result.affectedRows > 0);
      });
    });
  }

  return {
    getCachedSummary,
    recoverRawText,
    insertSummary,
    upsertSummary,
    updateSummary
  };
};

