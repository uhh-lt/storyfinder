// webserver/public/utils/bridge.js
// postMessage bridge between extension sidepanel and this app (works also in top-level).
export function notify(type, payload = {}) {
  try {
    window.parent && window.parent.postMessage({ type, ...payload }, '*');
  } catch {}
}

export function setupIncoming(onMsg) {
  window.addEventListener('message', (ev) => {
    const data = ev.data || {};
    if (!data || typeof data !== 'object') return;
    if (String(data.type || '').startsWith('sf:')) onMsg?.(data);
  });
}

export function isFramed() {
  try { return window.top !== window.self; } catch { return true; }
}

