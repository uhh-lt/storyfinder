// Article parsing and posting helpers
import { sendToContent } from './tabs.js';
import { normalizeBase } from './api.js';
import { storageSyncGet } from './storage.js';

const currentParsingJobs = new Set();

export function isParsingUrl(url) {
  return currentParsingJobs.has(url);
}

export function parseSite(url) {
  console.log('Parsing site... ', url);
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
    if (tabs && tabs[0]) {
      sendToContent(tabs[0].id, 'get-article', { tab: tabs[0].id, data: { isRelevant: true } });
    }
  });
}

export function handleForceParseSite() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
    if (tabs && tabs[0]) {
      if (isParsingUrl(tabs[0].url)) {
        console.log('Site is being parsed...');
      } else {
        parseSite(tabs[0].url);
      }
    }
  });
}

export function createReadabilityTab(html) {
  const encodedHtml = encodeURIComponent(html);
  const url = `data:text/html;charset=utf-8,${encodedHtml}`;
  chrome.tabs.create({ url, active: true });
}

export async function setArticle(data, tab) {
  try {
    // resolve target tab
    const targetTab = await (async () => {
      if (tab !== undefined && tab !== null) {
        return await new Promise((resolve) => chrome.tabs.get(tab, resolve));
      }
      return await new Promise((resolve) => {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
          resolve(tabs && tabs[0] ? tabs[0] : null);
        });
      });
    })();
    if (!targetTab) return;

    const url = new URL(targetTab.url);
    const article = {
      Site: {
        url: targetTab.url,
        host: url.protocol + '//' + url.host,
        headTitle: targetTab.title,
      },
      Article: data,
    };

    const items = await storageSyncGet({ server: '', serverInitialized: false });
    if (!items.serverInitialized || items.server === '') {
      console.log('Server is not defined or not initialized!');
      return;
    }

    currentParsingJobs.add(targetTab.url);
    chrome.action.setIcon({ path: 'icon-red-48.png', tabId: targetTab.id });

    try {
      article.Site.favicon = 'https://www.google.com/s2/favicons?domain=' + url.host;
      const response = await saveRemote(normalizeBase(items.server) + '/Sites', article);
      if (typeof response !== 'string' && !(response instanceof String)) {
        const responseIsDefined = response && response.Site !== undefined;
        if (responseIsDefined) {
          sendToContent(targetTab.id, 'set-entities', { data: response });
        }
      }
    } catch (err) {
      console.log('Error in setArticle:', err);
    } finally {
      currentParsingJobs.delete(targetTab.url);
      chrome.action.setIcon({ path: 'icon-48.png', tabId: targetTab.id });
    }
  } catch (e) {
    console.log('setArticle failed:', e);
  }
}

async function saveRemote(url, data) {
  // Cookie-session mode (no Basic Auth)
  const resp = await fetch(url, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Server responded with status ${resp.status}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return text; // fallback if not JSON
  }
}
