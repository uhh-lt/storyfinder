// Content actions helpers (one-way messages to the active tab)
import { sendToContent } from './tabs.js';

export function doReadability() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
    if (tabs && tabs[0]) {
      sendToContent(tabs[0].id, 'perform-readability');
    }
  });
}

export function toggleHighlight(checked) {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) {
    if (tabs && tabs[0]) {
      sendToContent(tabs[0].id, 'toggle-highlight', { checked });
    }
  });
}

