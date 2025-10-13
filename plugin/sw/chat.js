// Chat handlers and helpers
import { getActiveTabUrl, sendToContent } from './tabs.js';
import { apiPATCH, apiDELETE, getJsonWithCookies, postJsonWithCookies } from './api.js';

function emitChatResponse(ok, status, payload, err) {
  const msg = err
    ? { type: 'chat_response', ok: false, error: String(err) }
    : { type: 'chat_response', ok: !!ok, status: status ?? null, data: payload ?? null };
  try { chrome.runtime.sendMessage(msg); } catch {}
}

function requestLiveContextFromActiveTab() {
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; resolve(null); }
    }, 5000);

    function onMessage(msg) {
      if (!msg || msg.type !== 'plain_extracted') return;
      chrome.runtime.onMessage.removeListener(onMessage);
      if (!settled) {
        clearTimeout(timeout);
        settled = true;
        if (msg.error) {
          console.warn('[CHAT] extract-plain error:', msg.error);
          resolve(null);
        } else {
          resolve(typeof msg.text === 'string' ? msg.text : null);
        }
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);

    try {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
        const tabId = tabs && tabs[0] ? tabs[0].id : null;
        if (!tabId) { resolve(null); return; }
        sendToContent(tabId, 'extract-plain');
      });
    } catch (e) {
      console.warn('[CHAT] requestLiveContextFromActiveTab failed:', e);
      resolve(null);
    }
  });
}

export async function handleChatQuestion(data) {
  try {
    const activeUrl = await getActiveTabUrl();
    const baseBody = {
      question: data?.question || '',
      scope: data?.scope || 'current',
      sessionId: data?.sessionId || null,
      url: activeUrl || '',
      contextMode: data?.contextMode || 'current',
      selectedIds: Array.isArray(data?.selectedIds) && data.selectedIds.length ? data.selectedIds : undefined,
      ctxCount: (typeof data?.ctxCount === 'number') ? data.ctxCount : undefined
    };

    // First try: DB lookup via server
    let { ok, status, payload } = await postJsonWithCookies('/chat', baseBody);

    // Fallback: if no DB context -> request live text and retry
    if (!ok && status === 404 && /No article context/i.test(payload?.error || '')) {
      const liveContext = await requestLiveContextFromActiveTab();
      ({ ok, status, payload } = await postJsonWithCookies('/chat', {
        ...baseBody,
        context: liveContext || ''
      }));
    }

    if (!ok) console.error('[CHAT] Server error:', { status, payload });
    emitChatResponse(ok, status, payload);
  } catch (err) {
    console.error('[CHAT] Fetch error:', err);
    emitChatResponse(false, null, null, err);
  }
}

export function handleMsg(data) {
  try {
    const a = data?.action;
    switch (a) {
      case 'userRegistered':
        // No-op here; registration handled elsewhere previously
        break;

      case 'chat-question':
        handleChatQuestion(data);
        break;

      case 'chat-list-sessions':
        (async () => {
          try {
            const { ok, status, payload } = await getJsonWithCookies('/chat/sessions');
            chrome.runtime.sendMessage({ type: 'chat_sessions', ok, status, data: payload });
          } catch (e) {
            chrome.runtime.sendMessage({ type: 'chat_sessions', ok: false, error: String(e) });
          }
        })();
        break;

      case 'chat-load-session':
        (async () => {
          try {
            const sessionId = data?.sessionId;
            if (!sessionId) {
              return chrome.runtime.sendMessage({ type: 'chat_history', ok: false, error: 'Missing sessionId' });
            }
            const { ok, status, payload } = await getJsonWithCookies('/chat/sessions/' + encodeURIComponent(sessionId));
            chrome.runtime.sendMessage({ type: 'chat_history', ok, status, data: payload });
          } catch (e) {
            chrome.runtime.sendMessage({ type: 'chat_history', ok: false, error: String(e) });
          }
        })();
        break;

      case 'chat-context-list':
        (async () => {
          try {
            let qs = '?limit=' + encodeURIComponent(data?.limit || 50);
            if (data?.domain === true) {
              const activeUrl = await getActiveTabUrl();
              try {
                const host = new URL(activeUrl).hostname;
                if (host) qs += '&host=' + encodeURIComponent(host);
              } catch(_) {}
            }
            const { ok, status, payload } = await getJsonWithCookies('/chat/contexts/recent' + qs);
            chrome.runtime.sendMessage({ type: 'chat_contexts', ok, status, data: payload });
          } catch (e) {
            chrome.runtime.sendMessage({ type: 'chat_contexts', ok: false, error: String(e) });
          }
        })();
        break;

      case 'chat-context-preview':
        (async () => {
          try {
            // Determine effective URL (from message or active tab)
            let effUrl = data?.url || '';
            if (!effUrl || !effUrl.length) {
              try { effUrl = await getActiveTabUrl(); } catch(_) {}
            }
            const payload = {
              url: effUrl || '',
              contextMode: data?.contextMode || 'current',
              selectedIds: Array.isArray(data?.selectedIds) ? data.selectedIds : undefined,
              ctxCount: data?.ctxCount
            };
            let { ok, status, payload: resp } = await postJsonWithCookies('/chat/context/preview', payload);
            // Fallback: if DB lacks context for 'current', try live extraction
            if (!ok && status === 404 && /No article context/i.test(resp?.error || '')) {
              try {
                const liveContext = await requestLiveContextFromActiveTab();
                ({ ok, status, payload: resp } = await postJsonWithCookies('/chat/context/preview', { ...payload, context: liveContext || '' }));
              } catch(_) {}
            }
            chrome.runtime.sendMessage({ type: 'chat_context_preview', ok, status, data: resp, error: ok ? null : (resp?.error || 'Request failed') });
          } catch (e) {
            chrome.runtime.sendMessage({ type: 'chat_context_preview', ok: false, error: String(e) });
          }
        })();
        break;

      case 'chat-session-rename':
        (async () => {
          try {
            const { sessionId, title } = data;
            const payload = { title: String(title || '').trim() };
            const res = await apiPATCH(`/chat/sessions/${sessionId}`, payload);
            chrome.runtime.sendMessage({ ok: true, type: 'chat_session_renamed', data: res });
          } catch (err) {
            chrome.runtime.sendMessage({ ok: false, type: 'chat_session_renamed', error: err.message, status: err.status, details: err.data });
          }
        })();
        break;

      case 'chat-session-delete':
        (async () => {
          try {
            const { sessionId } = data;
            const res = await apiDELETE(`/chat/sessions/${sessionId}`);
            chrome.runtime.sendMessage({ ok: true, type: 'chat_session_deleted', data: res });
          } catch (err) {
            chrome.runtime.sendMessage({ ok: false, type: 'chat_session_deleted', error: err.message, status: err.status, details: err.data });
          }
        })();
        break;

      case 'chat-edit-message':
        (async () => {
          try {
            const { sessionId, messageId, role, content } = data;
            const res = await apiPATCH(`/chat/sessions/${sessionId}/messages/${messageId}`, { role, content });
            chrome.runtime.sendMessage({ ok: true, type: 'chat_message_edited', data: res });
            chrome.runtime.sendMessage({ ok: true, type: 'chat_history', data: { session: { id: res.sessionId }, messages: res.messages } });
          } catch (err) {
            chrome.runtime.sendMessage({ ok: false, type: 'chat_message_edited', error: err.message, status: err.status, details: err.data });
          }
        })();
        break;

      case 'chat-message-edit-resend':
        (async () => {
          try {
            const {
              messageId,
              content,
              resend = true,
              url = null,
              contextMode = undefined,
              selectedIds = undefined,
              ctxCount = undefined,
              scope = undefined,
            } = data;

            // Prefer provided URL; fall back to active tab if empty
            let effUrl = url || '';
            if (!effUrl || !effUrl.length) {
              try { effUrl = await getActiveTabUrl(); } catch (_) {}
            }

            const payload = {
              content,
              resend: !!resend,
              url: effUrl,
              scope: 'current',
              contextMode: contextMode || 'recent',
              selectedIds,
              ctxCount,
            };
            const res = await apiPATCH(`/chat/messages/${messageId}`, payload);

            // Event-Bus back to UI
            chrome.runtime.sendMessage({ ok: true, type: 'chat_message_edited', data: res });
            if (res && res.sessionId && res.messages) {
              chrome.runtime.sendMessage({ ok: true, type: 'chat_history', data: { session: { id: res.sessionId }, messages: res.messages } });
            }
          } catch (err) {
            chrome.runtime.sendMessage({ ok: false, type: 'chat_message_edited', error: err.message, status: err.status, details: err.data });
          }
        })();
        break;

      default:
        break;
    }
  } catch (e) {
    console.warn('[SW] msg handler failed:', e);
  }
}
