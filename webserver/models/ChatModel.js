// webserver/models/ChatModel.js
/**
 * models/ChatModel.js
 *
 * DB helpers for Chat:
 *  - getContextByUrl(url, userId)
 *  - createSession({ userId, title })
 *  - addMessage({ sessionId, userId, role, content })
 *  - getSessionHistory({ sessionId, userId, limit })
 *  - ensureSessionOwnership({ sessionId, userId })
 */

module.exports = function(connection /*, models */) {
  /**
   * Get the latest article text for a given URL and user.
   * @param {string} url
   * @param {number} userId
   * @returns {Promise<string|null>}
   */
  async function getContextByUrl(url, userId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT a.text
        FROM articles a
        JOIN sites s       ON s.id = a.site_id
        JOIN collections c ON c.id = s.collection_id
        WHERE s.url = ? AND c.user_id = ?
          AND s.is_deleted = 0 AND a.is_deleted = 0
        ORDER BY a.created DESC
        LIMIT 1
      `;
      const params = [url, userId];

      connection.query(sql, params, (err, rows) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) return resolve(null);

        const text = rows[0]?.text;
        if (typeof text === 'string' && text.length > 0) {
          resolve(text);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Create a new chat session.
   * @param {{userId:number, title?:string|null}} p
   * @returns {Promise<{id:number}>}
   */
  async function createSession({ userId, title = null }) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO chat_sessions (user_id, title, created, last_message_at)
        VALUES (?, ?, NOW(), NULL)
      `;
      connection.query(sql, [userId, title], (err, result) => {
        if (err) return reject(err);
        resolve({ id: result.insertId });
      });
    });
  }

  /**
   * Add a chat message and bump last_message_at.
   * @param {{sessionId:number, userId:number, role:'user'|'assistant', content:string}} p
   * @returns {Promise<{id:number}>}
   */
  async function addMessage({ sessionId, userId, role, content }) {
    return new Promise((resolve, reject) => {
      connection.beginTransaction(err => {
        if (err) return reject(err);

        const ins = `
          INSERT INTO chat_messages (session_id, user_id, role, content, created)
          VALUES (?, ?, ?, ?, NOW())
        `;
        connection.query(ins, [sessionId, userId, role, content], (err1, result) => {
          if (err1) {
            return connection.rollback(() => reject(err1));
          }
          const upd = `UPDATE chat_sessions SET last_message_at = NOW() WHERE id = ? AND user_id = ?`;
          connection.query(upd, [sessionId, userId], (err2) => {
            if (err2) {
              return connection.rollback(() => reject(err2));
            }
            connection.commit(err3 => {
              if (err3) return connection.rollback(() => reject(err3));
              resolve({ id: result.insertId });
            });
          });
        });
      });
    });
  }

  /**
   * Ensure the session belongs to the given user.
   * @param {{sessionId:number, userId:number}} p
   * @returns {Promise<boolean>}
   */
  async function ensureSessionOwnership({ sessionId, userId }) {
    return new Promise((resolve, reject) => {
      const sql = `SELECT 1 FROM chat_sessions WHERE id = ? AND user_id = ? LIMIT 1`;
      connection.query(sql, [sessionId, userId], (err, rows) => {
        if (err) return reject(err);
        resolve(!!(rows && rows.length > 0));
      });
    });
  }

  /**
   * Get messages of a session (oldest first).
   * @param {{sessionId:number, userId:number, limit?:number}} p
   * @returns {Promise<Array<{id:number, role:string, content:string, created:string}>>}
   */
  async function getSessionHistory({ sessionId, userId, limit = 100 }) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, role, content, created
        FROM chat_messages
        WHERE session_id = ? AND user_id = ?
        ORDER BY created ASC, id ASC
        LIMIT ?
      `;
      connection.query(sql, [sessionId, userId, Number(limit) || 100], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  /**
   * List sessions for a user (newest first).
   * @returns {Promise<Array<{id:number,title:string|null,created:string,last_message_at:string|null}>>}
   */
  async function listSessions(userId, limit = 50) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, title, created, last_message_at
        FROM chat_sessions
        WHERE user_id = ?
        ORDER BY COALESCE(last_message_at, created) DESC, id DESC
        LIMIT ?
      `;
      connection.query(sql, [userId, Number(limit) || 50], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  /**
   * Get session meta (ensures ownership).
   * @returns {Promise<{id:number,title:string|null,created:string,last_message_at:string|null}|null>}
   */
  async function getSessionMeta(sessionId, userId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT id, title, created, last_message_at
        FROM chat_sessions
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `;
      connection.query(sql, [sessionId, userId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows?.[0] || null);
      });
    });
  }

  /**
   * List recent articles meta (no large text).
   * Optional host filter (based on s.url).
   * @returns Promise<Array<{id:number, url:string, created:string}>>
   */
  async function listRecentArticlesMeta({ userId, limit = 50, host = null }) {
    return new Promise((resolve, reject) => {
      const params = [userId];
      let where = `c.user_id = ?`;
      if (host) {
        // match scheme//host/… in s.url; generous LIKE fallback
        params.push(`%//${host}/%`);
        where += ` AND s.url LIKE ?`;
      }
      const sql = `
        SELECT a.id AS id, s.url AS url, a.created AS created
        FROM articles a
        JOIN sites s       ON s.id = a.site_id
        JOIN collections c ON c.id = s.collection_id
        WHERE ${where} AND s.is_deleted = 0 AND a.is_deleted = 0
        ORDER BY a.created DESC, a.id DESC
        LIMIT ${Number(limit) || 50}
      `;
      connection.query(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  /**
   * Get recent articles WITH text (for building context).
   * Optional host filter. Truncation happens at controller level.
   * @returns Promise<Array<{id:number,url:string,created:string,text:string}>>
   */
  async function listRecentArticlesWithText({ userId, limit = 3, host = null }) {
    return new Promise((resolve, reject) => {
      const params = [userId];
      let where = `c.user_id = ?`;
      if (host) {
        params.push(`%//${host}/%`);
        where += ` AND s.url LIKE ?`;
      }
      const sql = `
        SELECT a.id AS id, s.url AS url, a.created AS created, a.text AS text
        FROM articles a
        JOIN sites s       ON s.id = a.site_id
        JOIN collections c ON c.id = s.collection_id
        WHERE ${where} AND s.is_deleted = 0 AND a.is_deleted = 0
        ORDER BY a.created DESC, a.id DESC
        LIMIT ${Number(limit) || 3}
      `;
      connection.query(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  /**
   * Get articles by IDs WITH ownership (user_id via collections).
   * @param {{userId:number, ids:number[]}}
   * @returns Promise<Array<{id:number,url:string,created:string,text:string}>>
   */
  async function getArticlesByIdsWithText({ userId, ids = [] }) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    // ensure numeric & unique
    const cleanIds = [...new Set(ids.map(x => Number(x)).filter(n => Number.isInteger(n) && n > 0))];
    if (cleanIds.length === 0) return [];

    return new Promise((resolve, reject) => {
      // Use IN (...) safely by constructing placeholders
      const placeholders = cleanIds.map(() => '?').join(',');
      const params = [userId, ...cleanIds];
      const sql = `
        SELECT a.id AS id, s.url AS url, a.created AS created, a.text AS text
        FROM articles a
        JOIN sites s       ON s.id = a.site_id
        JOIN collections c ON c.id = s.collection_id
        WHERE c.user_id = ? AND a.id IN (${placeholders})
          AND s.is_deleted = 0 AND a.is_deleted = 0
        ORDER BY FIELD(a.id, ${placeholders})
      `;
      // params for FIELD again
      connection.query(sql, [...params, ...cleanIds], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  /**
   * Rename a chat session (ensures ownership via WHERE).
   * @param {number} userId
   * @param {number} sessionId
   * @param {string} title
   * @returns {Promise<{id:number,title:string}>}
   */
  async function renameSession(userId, sessionId, title) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE chat_sessions
        SET title = ?
        WHERE id = ? AND user_id = ?
      `;
      connection.query(sql, [title, Number(sessionId), Number(userId)], (err, result) => {
        if (err) return reject(err);
        if (!result || result.affectedRows === 0) return resolve(null);
        resolve({ id: Number(sessionId), title });
      });
    });
  }

  /**
   * Delete a chat session owned by the user.
   * Messages are removed by FK ON DELETE CASCADE.
   * @param {number} userId
   * @param {number} sessionId
   * @returns {Promise<boolean>} true if deleted
   */
  async function deleteSession(userId, sessionId) {
    return new Promise((resolve, reject) => {
      const sql = `
        DELETE FROM chat_sessions
        WHERE id = ? AND user_id = ?
      `;
      connection.query(sql, [Number(sessionId), Number(userId)], (err, result) => {
        if (err) return reject(err);
        resolve(!!(result && result.affectedRows > 0));
      });
    });
  }

  /**
   * Get message meta for ownership and role checks.
   * @param {number} messageId
   * @param {number} userId
   * @returns {Promise<{id:number, session_id:number, user_id:number, role:'user'|'assistant'}|null>}
   */
  async function getMessageMeta(messageId, userId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT m.id, m.session_id, s.user_id, m.role
        FROM chat_messages m
        JOIN chat_sessions s ON s.id = m.session_id
        WHERE m.id = ? AND s.user_id = ?
        LIMIT 1
      `;
      connection.query(sql, [Number(messageId), Number(userId)], (err, rows) => {
        if (err) return reject(err);
        resolve(rows?.[0] || null);
      });
    });
  }

  /**
   * Update content of a user-owned user-message.
   * Enforces role='user' and ownership via WHERE.
   * @param {number} userId
   * @param {number} messageId
   * @param {string} content
   * @returns {Promise<boolean>} true if updated
   */
  async function updateMessageContent(userId, messageId, content) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE chat_messages m
        JOIN chat_sessions s ON s.id = m.session_id
        SET m.content = ?, m.created = NOW()
        WHERE m.id = ? AND s.user_id = ? AND m.role = 'user'
      `;
      connection.query(sql, [content, Number(messageId), Number(userId)], (err, result) => {
        if (err) return reject(err);
        resolve(!!(result && result.affectedRows > 0));
      });
    });
  }

  /**
   * Return the consecutive assistant message IDs that appear immediately
   * after a given user message within the same session (stop when a user message appears).
   * @param {number} userId
   * @param {number} sessionId
   * @param {number} userMessageId
   * @param {number} [scanLimit=50] safety cap for scan
   * @returns {Promise<number[]>}
   */
  async function listAssistantRepliesAfterUserMessage(userId, sessionId, userMessageId, scanLimit = 50) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT m.id, m.role
        FROM chat_messages m
        JOIN chat_sessions s ON s.id = m.session_id
        WHERE m.session_id = ? AND m.id > ? AND s.user_id = ?
        ORDER BY m.id ASC
        LIMIT ?
      `;
      connection.query(sql, [Number(sessionId), Number(userMessageId), Number(userId), Number(scanLimit)], (err, rows) => {
        if (err) return reject(err);
        const out = [];
        for (const r of (rows || [])) {
          const role = (r.role || '').toLowerCase();
          if (role === 'assistant') {
            out.push(Number(r.id));
            continue;
          }
          // first non-assistant breaks the run
          break;
        }
        resolve(out);
      });
    });
  }

  /**
   * Delete messages by IDs, enforcing ownership via session join.
   * @param {number} userId
   * @param {number[]} ids
   * @returns {Promise<number>} number of deleted rows
   */
  async function deleteMessagesByIds(userId, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    return new Promise((resolve, reject) => {
      const sql = `
        DELETE m FROM chat_messages m
        JOIN chat_sessions s ON s.id = m.session_id
        WHERE s.user_id = ? AND m.id IN ( ${ids.map(() => '?').join(', ')} )
      `;
      connection.query(sql, [Number(userId), ...ids.map(Number)], (err, result) => {
        if (err) return reject(err);
        resolve(result?.affectedRows || 0);
      });
    });
  }

  /**
   * Delete the consecutive assistant replies right after a given user message.
   * @returns {Promise<number>} number of deleted assistant messages
   */
  async function deleteAssistantRepliesAfterUserMessage(userId, sessionId, userMessageId) {
    const ids = await listAssistantRepliesAfterUserMessage(userId, sessionId, userMessageId);
    if (!ids.length) return 0;
    const n = await deleteMessagesByIds(userId, ids);
    return n;
  }

  /**
   * Delete all messages in a session that come AFTER a given message id.
   * Ownership is enforced by joining through chat_sessions.
   * @param {number} userId
   * @param {number} sessionId
   * @param {number} afterMessageId
   * @returns {Promise<number>} number of deleted rows
   */
  async function deleteMessagesAfterId(userId, sessionId, afterMessageId) {
    return new Promise((resolve, reject) => {
      const sql = `
        DELETE m FROM chat_messages m
        JOIN chat_sessions s ON s.id = m.session_id
        WHERE s.user_id = ? AND m.session_id = ? AND m.id > ?
      `;
      connection.query(sql, [Number(userId), Number(sessionId), Number(afterMessageId)], (err, result) => {
        if (err) return reject(err);
        resolve(result?.affectedRows || 0);
      });
    });
  }

  // Public API of this model
  return {
    getContextByUrl,
    createSession,
    addMessage,
    ensureSessionOwnership,
    getSessionHistory,
    listSessions,
    getSessionMeta,
    listRecentArticlesMeta,
    listRecentArticlesWithText,
    getArticlesByIdsWithText,
    renameSession,
    deleteSession,
    getMessageMeta,
    updateMessageContent,
    listAssistantRepliesAfterUserMessage,
    deleteMessagesByIds,
    deleteAssistantRepliesAfterUserMessage,
    deleteMessagesAfterId
  };
};
