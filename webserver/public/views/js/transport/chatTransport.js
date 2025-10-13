// webserver/public/views/js/transport/chatTransport.js
// Factory for chat transport: switches between panel (postMessage) and tab (HTTP)

export function createChatTransport({ mode, apiFetch, safeErr, postToSidepanel, handlers }) {
  const isPanel = mode === 'panel';
  // Track in-flight request so we can cancel when editing older messages
  let _inFlight = null; // { controller: AbortController, type: 'ask'|'edit' }

  function abortInFlight() {
    try { _inFlight?.controller?.abort(); } catch {}
    _inFlight = null;
  }

  const api = {
    async ask(body) {
      if (isPanel) return postToSidepanel({ action: 'chat-question', ...body });
      abortInFlight();
      const controller = new AbortController();
      _inFlight = { controller, type: 'ask' };
      let res;
      try {
        res = await apiFetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } catch (e) {
        if (e?.name === 'AbortError' || String(e).includes('aborted') || String(e).includes('abort')) {
          // Silently ignore aborted request
          return;
        }
        throw e;
      } finally {
        _inFlight = null;
      }
      const data = await res.json();
      handlers && handlers.chat_response && handlers.chat_response({ ok: res.ok, status: res.status, data, error: res.ok ? null : (await safeErr(res)) });
      const sid = data?.sessionId;
      if (res.ok && typeof sid === 'number') await api.loadSession(sid);
    },

    async listSessions() {
      if (isPanel) return postToSidepanel({ action: 'chat-list-sessions' });
      const res = await apiFetch('/chat/sessions');
      const data = await res.json();
      handlers && handlers.chat_sessions && handlers.chat_sessions({ ok: res.ok, status: res.status, data, error: res.ok ? null : (await safeErr(res)) });
    },

    async loadSession(id) {
      if (isPanel) return postToSidepanel({ action: 'chat-load-session', sessionId: id });
      const res = await apiFetch(`/chat/sessions/${encodeURIComponent(id)}`);
      const data = await res.json();
      handlers && handlers.chat_history && handlers.chat_history({ ok: res.ok, status: res.status, data, error: res.ok ? null : (await safeErr(res)) });
    },

    async listContexts(opts = {}) {
      if (isPanel) return postToSidepanel({ action: 'chat-context-list', ...opts });
      const qs = new URLSearchParams({ limit: String(opts.limit ?? 50) });
      const res = await apiFetch(`/chat/contexts/recent?${qs.toString()}`);
      const data = await res.json();
      handlers && handlers.chat_contexts && handlers.chat_contexts({ ok: res.ok, status: res.status, data, error: res.ok ? null : (await safeErr(res)) });
    },

    async previewContext(opts = {}) {
      if (isPanel) return postToSidepanel({ action: 'chat-context-preview', ...opts });
      // Tab mode: call preview endpoint directly
      const res = await apiFetch('/chat/context/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts)
      });
      const data = await res.json();
      handlers && handlers.chat_context_preview && handlers.chat_context_preview({ ok: res.ok, status: res.status, data, error: res.ok ? null : (await safeErr(res)) });
    },

    async renameSession(id, title) {
      if (isPanel) return postToSidepanel({ action: 'chat-session-rename', sessionId: id, title });
      const res = await apiFetch(`/chat/sessions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      const payload = res.ok ? await res.json() : { error: await safeErr(res) };
      handlers && handlers.chat_session_renamed && handlers.chat_session_renamed({ ok: res.ok, data: payload, error: payload?.error });
    },

    async deleteSession(id) {
      if (isPanel) return postToSidepanel({ action: 'chat-session-delete', sessionId: id });
      const res = await apiFetch(`/chat/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const payload = res.ok ? await res.json() : { error: await safeErr(res) };
      handlers && handlers.chat_session_deleted && handlers.chat_session_deleted({ ok: res.ok, data: payload, error: payload?.error });
    },

    async editResend({ messageId, content, resend = true, url, scope, contextMode, selectedIds, ctxCount }) {
      if (isPanel) return postToSidepanel({ action: 'chat-message-edit-resend', messageId, content, resend, url, scope, contextMode, selectedIds, ctxCount });
      abortInFlight();
      const controller = new AbortController();
      _inFlight = { controller, type: 'edit' };
      let res;
      try {
        res = await apiFetch(`/chat/messages/${encodeURIComponent(messageId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, resend, url, scope, contextMode, selectedIds, ctxCount }),
          signal: controller.signal
        });
      } catch (e) {
        if (e?.name === 'AbortError' || String(e).includes('aborted') || String(e).includes('abort')) {
          return;
        }
        throw e;
      } finally {
        _inFlight = null;
      }
      const data = await res.json();
      handlers && handlers.chat_message_edited && handlers.chat_message_edited({ ok: res.ok, data, error: res.ok ? null : (data?.error || await safeErr(res)) });
      if (res.ok && typeof data?.sessionId === 'number') await api.loadSession(data.sessionId);
    },

    cancelInFlight() {
      abortInFlight();
    }
  };

  return api;
}
