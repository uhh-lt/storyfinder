// Tabs and content-script helpers

export function sendToContent(tabId, content_job, extra) {
  if (!tabId) return;
  const { expectResponse, ...rest } = extra || {};
  const msg = Object.assign({ content_job }, rest);

  if (expectResponse === true) {
    // Only attach a callback when a response is explicitly expected.
    chrome.tabs.sendMessage(tabId, msg, function () {
      if (chrome.runtime.lastError) {
        // Still log non-benign errors when we explicitly expected a response.
        const m = chrome.runtime.lastError.message || '';
        if (!/The message port closed before a response was received\./i.test(m) &&
            !/Receiving end does not exist\./i.test(m)) {
          console.warn('[SW] sendToContent callback error:', tabId, content_job, m);
        }
      }
    });
  } else {
    // Fire-and-forget: do not attach a callback to avoid benign warnings.
    try {
      chrome.tabs.sendMessage(tabId, msg);
    } catch (e) {
      // If sending fails synchronously (very rare), log once.
      console.warn('[SW] sendToContent send error:', tabId, content_job, e?.message || String(e));
    }
  }
}

export function getActiveTabUrl() {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
        if (tabs && tabs[0] && tabs[0].url) return resolve(tabs[0].url);
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs2) {
          if (tabs2 && tabs2[0] && tabs2[0].url) return resolve(tabs2[0].url);
          resolve("");
        });
      });
    } catch (_) {
      resolve("");
    }
  });
}
