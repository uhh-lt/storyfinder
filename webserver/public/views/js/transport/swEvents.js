// webserver/public/views/js/transport/swEvents.js
// Attach/detach Service Worker event routing for panel mode

let _listener = null;

export function attachSwEvents({ windowRef, handlers }) {
  if (!windowRef || typeof windowRef.addEventListener !== 'function') return;
  if (_listener) return; // idempotent
  _listener = (ev) => {
    const payload = ev?.data || {};
    if (!payload || typeof payload !== 'object') return;
    const type = payload.type;
    if (!type) return;
    const h = handlers && handlers[type];
    if (typeof h === 'function') {
      try { h(payload); } catch (err) { console.error('swEvents handler error:', err); }
    }
  };
  windowRef.addEventListener('message', _listener);
}

export function detachSwEvents({ windowRef }) {
  if (!windowRef || typeof windowRef.removeEventListener !== 'function') return;
  if (_listener) {
    windowRef.removeEventListener('message', _listener);
    _listener = null;
  }
}

