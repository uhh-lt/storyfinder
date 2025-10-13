// Summarize routing and server call handling
import { sendToContent } from './tabs.js';
import { normalizeBase } from './api.js';

const forceByTab = Object.create(null); // { [tabId]: boolean }
let summarizeReqCounter = 0;
const summarizePending = Object.create(null); // { [requestId]: tabId }

export function handleTriggerSummarize(msg, sender, mainWindowId) {
  const incomingForce = !!msg.forceRefresh;

  // Direct server call from summary tab
  if (msg.serverOnly === true && typeof msg.url === 'string' && msg.url.length > 0) {
    const originTabId = sender && sender.tab && sender.tab.id ? sender.tab.id : null;
    const requestId = ++summarizeReqCounter;
    sendSummarizeRequest({ url: msg.url }, { originTabId, requestId, forceRefresh: incomingForce });
    return;
  }

  const sendToTab = (tabId) => {
    if (!tabId) return;
    forceByTab[tabId] = incomingForce;
    sendToContent(tabId, 'summarize');
  };

  const tabIdFromSender = sender && sender.tab && sender.tab.id ? sender.tab.id : null;
  if (tabIdFromSender) {
    sendToTab(tabIdFromSender);
  } else {
    const query = mainWindowId
      ? { active: true, windowId: mainWindowId }
      : { active: true, lastFocusedWindow: true };
    chrome.tabs.query(query, function (tabs) {
      if (tabs && tabs[0]) sendToTab(tabs[0].id);
    });
  }
}

export function handleSummarizeRequest(msg, sender) {
  const originTabId = sender && sender.tab && sender.tab.id ? sender.tab.id : null;
  const requestId = ++summarizeReqCounter;
  if (originTabId) summarizePending[requestId] = originTabId;

  const forceRefresh = originTabId ? !!forceByTab[originTabId] : false;
  if (originTabId) delete forceByTab[originTabId];

  sendSummarizeRequest(msg.data, { originTabId, requestId, forceRefresh });
}

function sendSummarizeRequest(payload, meta) {
  chrome.storage.sync.get({ server: '', serverInitialized: false }, function (items) {
    if (!items.serverInitialized || items.server === '') {
      console.error('[SW] Server URL is not set in plugin settings.');
      return;
    }

    const url = items.server.replace(/\/$/, '') + '/summarize';
    const bodyObj = {
      url: payload?.url || '',
      forceRefresh: !!meta.forceRefresh,
    };
    if (typeof payload?.text === 'string' && payload.text.length > 0) {
      bodyObj.text = payload.text;
    }
    const body = JSON.stringify(bodyObj);

    fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
      .then((r) => r.json())
      .then((data) => {
        const tabId = summarizePending[meta.requestId] || meta.originTabId;
        delete summarizePending[meta.requestId];
        if (!tabId) {
          console.warn('[SW] No target tab for summarize_response (reqId:', meta.requestId + ')');
          return;
        }
        chrome.tabs.sendMessage(tabId, { type: 'summarize_response', data }, function () {
          if (chrome.runtime.lastError) {
            console.warn('[SW] Could not send summarize_response to tab', tabId, chrome.runtime.lastError.message);
          }
        });
      })
      .catch((error) => {
        console.error('[SW] Error during summarize fetch (reqId:', meta.requestId + '):', error);
        const tabId = summarizePending[meta.requestId] || meta.originTabId;
        delete summarizePending[meta.requestId];
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            type: 'summarize_response',
            data: { error: true, message: 'Summarization failed' },
          });
        }
      });
  });
}

// Open the summary page and stash payload in local storage for the page to read
export function openSummaryTab(msg) {
  chrome.storage.local.set(
    {
      'sf:lastSummary': {
        summary: msg.summary || '',
        url: msg.url || '',
        fromCache: !!msg.fromCache,
        edited: !!msg.edited,
        ts: Date.now(),
      },
    },
    () => {
      const pageUrl = chrome.runtime.getURL('summary.html');
      chrome.tabs.create({ url: pageUrl });
    }
  );
}

// Save edited summary back to the server and notify the originating tab
export async function handleSaveEditedSummary(msg, sender) {
  try {
    const { requestId, summary, text_hash, url } = msg;
    const cfg = await chrome.storage.sync.get(['server']);
    if (!cfg.server) {
      if (sender?.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'summary_edit_response',
          requestId,
          ok: false,
          error: 'Server URL missing',
        });
      }
      return;
    }

    const body = { summary };
    if (text_hash) body.text_hash = text_hash;
    if (url) body.url = url;

    const resp = await fetch(normalizeBase(cfg.server) + '/summary/edit', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
    });

    const targetTabId = sender?.tab?.id;
    if (!targetTabId) return;

    if (!resp.ok) {
      let errText = 'Request failed';
      try {
        const errJson = await resp.json();
        if (errJson?.error) errText = errJson.error;
      } catch (_) {}
      chrome.tabs.sendMessage(targetTabId, {
        type: 'summary_edit_response',
        requestId,
        ok: false,
        status: resp.status,
        error: errText,
      });
      return;
    }

    chrome.tabs.sendMessage(targetTabId, {
      type: 'summary_edit_response',
      requestId,
      ok: true,
    });
  } catch (e) {
    const targetTabId = sender?.tab?.id;
    if (targetTabId) {
      chrome.tabs.sendMessage(targetTabId, {
        type: 'summary_edit_response',
        requestId: msg.requestId,
        ok: false,
        error: e?.message || String(e),
      });
    }
  }
}
