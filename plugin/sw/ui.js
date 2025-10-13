// UI helpers: open side panel and close behaviors

/**
 * Try to open the Chrome Side Panel with our sidepanel.html.
 * If the side panel API is unavailable, call the provided fallback
 * (usually a legacy toggleSidebar function in the SW).
 *
 * @param {*} sender chrome.runtime.onMessage sender
 * @param {Function} fallback function to call on failure
 */
export async function openSidePanel(sender, fallback) {
  try {
    let tabId = (sender && sender.tab && sender.tab.id) ? sender.tab.id : null;
    if (!tabId) {
      tabId = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) =>
          resolve(tabs && tabs[0] ? tabs[0].id : null)
        );
      });
    }
    if (!tabId) throw new Error('No active tab to attach side panel');

    if (!chrome.sidePanel || typeof chrome.sidePanel.open !== 'function') {
      throw new Error('chrome.sidePanel API not available');
    }

    await chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true });
    await chrome.sidePanel.open({ tabId });
    console.log('[SW] Side Panel opened for tab', tabId);
  } catch (err) {
    console.warn('[SW] openSidePanel failed – falling back to legacy popup:',
      err && err.message ? err.message : err);
    try { if (typeof fallback === 'function') fallback(); } catch(e) {
      console.error('[SW] Legacy popup fallback failed:', e);
    }
  }
}

/**
 * Open a URL in new tab and then attempt to close/disable side panel on the current tab/window.
 */
export async function panelOpenTabAndClose(msg) {
  // Open requested URL
  try {
    if (typeof msg.url === 'string' && msg.url.length > 0) {
      await chrome.tabs.create({ url: msg.url });
    }
  } catch (e) {
    console.warn('[SW] panel-open-tab-and-close: tabs.create failed:', e);
  }

  // Resolve target tab/window of the panel we want to close
  let targetTabId = (typeof msg.tabId === 'number' && !Number.isNaN(msg.tabId)) ? msg.tabId : null;
  let targetWindowId = null;
  try {
    if (!targetTabId) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      targetTabId = tabs && tabs[0] ? tabs[0].id : null;
      targetWindowId = tabs && tabs[0] ? tabs[0].windowId : null;
    } else {
      const t = await chrome.tabs.get(targetTabId);
      targetWindowId = t?.windowId ?? null;
    }
  } catch (_) {}

  try {
    if (chrome.sidePanel && typeof chrome.sidePanel.close === 'function') {
      if (targetTabId) {
        await chrome.sidePanel.close({ tabId: targetTabId });
      } else if (targetWindowId) {
        await chrome.sidePanel.close({ windowId: targetWindowId });
      } else {
        await chrome.sidePanel.close({});
      }
    } else if (chrome.sidePanel && typeof chrome.sidePanel.setOptions === 'function') {
      if (targetTabId) {
        await chrome.sidePanel.setOptions({ tabId: targetTabId, enabled: false });
      }
      await chrome.sidePanel.setOptions({ enabled: false });
    }

    try { chrome.runtime.sendMessage({ type: 'panel-close-self', tabId: targetTabId }); } catch (_) {}
  } catch (e) {
    console.warn('[SW] panel-open-tab-and-close: close/disable failed:', e);
  }
}

/**
 * Attempt to close/disable the side panel on the current tab/window.
 */
export async function panelClose(msg) {
  let targetTabId = (typeof msg.tabId === 'number' && !Number.isNaN(msg.tabId)) ? msg.tabId : null;
  let targetWindowId = null;
  try {
    if (!targetTabId) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      targetTabId = tabs && tabs[0] ? tabs[0].id : null;
      targetWindowId = tabs && tabs[0] ? tabs[0].windowId : null;
    } else {
      const t = await chrome.tabs.get(targetTabId);
      targetWindowId = t?.windowId ?? null;
    }
  } catch (_) {}

  try {
    if (chrome.sidePanel && typeof chrome.sidePanel.close === 'function') {
      if (targetTabId) {
        await chrome.sidePanel.close({ tabId: targetTabId });
      } else if (targetWindowId) {
        await chrome.sidePanel.close({ windowId: targetWindowId });
      } else {
        await chrome.sidePanel.close({});
      }
    } else if (chrome.sidePanel && typeof chrome.sidePanel.setOptions === 'function') {
      if (targetTabId) {
        await chrome.sidePanel.setOptions({ tabId: targetTabId, enabled: false });
      }
      await chrome.sidePanel.setOptions({ enabled: false });
    }

    try { chrome.runtime.sendMessage({ type: 'panel-close-self', tabId: targetTabId }); } catch (_) {}
  } catch (e) {
    console.warn('[SW] panel-close: close/disable failed:', e);
  }
}


// Emit sidebar event to sidepanel and legacy popup (if any)
export function emitSidebarEvent(event, data) {
  try {
    chrome.runtime.sendMessage({ type: 'msg', data: { action: event, data } });
  } catch (e) {
    console.warn('[SW] emit-sidebar-event -> sidepanel broadcast failed:', e);
  }
  withLegacyPopupTab((tabId) => {
    chrome.tabs.sendMessage(tabId, { type: 'msg', data: { action: event, data } });
  });
}

// ---------------- Legacy Popup (fallback) ----------------

let popUpWindowId = null;
let mainWindowId = chrome.windows.WINDOW_ID_CURRENT;
let mainURL = '';
const popupPercentage = 0.5;
const windowPercentage = 0.5;
let windowRectangle = { height: 0, width: 0, top: 0, left: 0 };

function createLegacyPopup(width, height, top, left) {
  chrome.windows.create(
    {
      url: chrome.runtime.getURL('popup.html'),
      focused: true,
      width,
      height,
      top,
      left
    },
    function (window) {
      popUpWindowId = window?.id ?? null;
    }
  );
}

export function toggleLegacySidebar() {
  if (popUpWindowId !== undefined && popUpWindowId !== null) {
    closeLegacyPopup();
  } else {
    chrome.windows.getCurrent(function (window) {
      windowRectangle = {
        height: window.height,
        width: window.width,
        top: window.top,
        left: window.left
      };
      mainWindowId = window.id;
      const popupWidth = Math.round(windowRectangle.width * popupPercentage);
      const windowWidth = Math.round(windowRectangle.width * windowPercentage);

      chrome.windows.update(mainWindowId, { width: windowWidth });
      createLegacyPopup(
        popupWidth,
        windowRectangle.height,
        windowRectangle.top,
        windowRectangle.left + windowWidth
      );
    });
  }
}

export function closeLegacyPopup() {
  if (popUpWindowId === null || popUpWindowId === undefined) return;
  try { chrome.windows.remove(popUpWindowId); } catch (_) {}
  popUpWindowId = null;
  try {
    chrome.windows.update(mainWindowId, {
      height: windowRectangle.height,
      width: windowRectangle.width,
      top: windowRectangle.top,
      left: windowRectangle.left
    });
  } catch (_) {}
}

// Utility for callers that need to forward a message to the legacy popup tab if present
export function withLegacyPopupTab(cb) {
  if (popUpWindowId === null || popUpWindowId === undefined) return;
  chrome.windows.get(popUpWindowId, { populate: true }, function (popup) {
    if (chrome.runtime.lastError || !popup || !popup.tabs || !popup.tabs.length) return;
    try { cb(popup.tabs[0].id); } catch (_) {}
  });
}

// Keep legacy state in sync similar to old SW listeners
chrome.windows.onRemoved.addListener(function (windowID) {
  if (windowID === popUpWindowId) {
    try {
      chrome.windows.update(mainWindowId, {
        width: windowRectangle.width,
        height: windowRectangle.height,
        top: windowRectangle.top,
        left: windowRectangle.left
      });
    } catch (_) {}
    popUpWindowId = null;
  }
});

chrome.windows.onFocusChanged.addListener(function (windowID) {
  if (windowID !== -1) {
    chrome.windows.get(windowID, {}, function (window) {
      if (window !== null && window !== undefined) {
        mainWindowId = window.id;
        chrome.tabs.query({ windowId: mainWindowId, active: true }, function (tabs) {
          if (tabs && tabs[0]) mainURL = tabs[0].url;
        });
      }
    });
  }
});

chrome.tabs.onActivated.addListener(function (activeInfo) {
  chrome.windows.get(activeInfo.windowId, {}, function (window) {
    if (window !== null && window !== undefined) {
      chrome.tabs.get(activeInfo.tabId, function (tab) {
        if (tab?.url && tab.url !== mainURL) {
          mainURL = tab.url;
        }
      });
    }
  });
});
