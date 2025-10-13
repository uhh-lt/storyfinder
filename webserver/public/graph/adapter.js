// public/graph/adapter.js
// Load EARLY (in <head>) to capture postMessages before legacy handlers.

(function () {
  try {
    const params = new URLSearchParams(location.search);
    const isEmbed = params.get('embed') === '1' || params.get('embed') === 'true';

    // Soften legacy alerts (avoid modal popups from default: "Unknown event action")
    const _alert = window.alert;
    window.alert = function (msg) {
      console.warn("[LEGACY ALERT suppressed]", msg);
      // If you want to debug occasionally, toggle the next line:
      // _alert.call(window, msg);
    };

    // Mark embed mode for CSS tweaks
    if (isEmbed) {
      document.documentElement.setAttribute('data-embed', '1');
    }

    // Minimal API we might call from here
    const api = {
      navigate(tab) {
        try {
          const name = String(tab || '').toLowerCase();
          if (name === 'relations') {
            document.querySelector('[data-toggle="show-relations"]')?.click();
          } else if (name === 'graph') {
            document.querySelector('.relation-details')?.classList.remove('active');
            document.querySelector('.node-create')?.classList.remove('active');
          }
        } catch (e) { console.warn('[graph-embed] navigate failed:', e); }
      },
      relayout() {
        try { window.dispatchEvent(new Event('resize')); } catch {}
      }
    };
    window.sfEmbed = api;

    // What we handle directly
    const HANDLED_ACTIONS = new Set(['relayout']);
    const HANDLED_TYPES   = new Set(['sf:navigate', 'app:relayout']); // accept both

    // CAPTURE listener: run BEFORE legacy receiveMessage handler
    window.addEventListener('message', (ev) => {
      const data = ev.data;

      // 1) No usable payload → swallow to avoid legacy "Unknown event action"
      if (!data || typeof data !== 'object') {
        ev.stopImmediatePropagation();
        ev.preventDefault?.();
        return;
      }

      // 2) Our type-based protocol
      if (data.type && HANDLED_TYPES.has(data.type)) {
        if (data.type === 'sf:navigate' && data.tab) api.navigate(data.tab);
        if (data.type === 'app:relayout') api.relayout();
        ev.stopImmediatePropagation();
        ev.preventDefault?.();
        return;
      }

      // 3) Legacy-style action
      if (data.action) {
        if (HANDLED_ACTIONS.has(data.action)) {
          if (data.action === 'relayout') api.relayout();
          ev.stopImmediatePropagation();
          ev.preventDefault?.();
          return;
        }
        // Unknown action → swallow (legacy would alert)
        console.debug('[graph-embed] swallow unknown action:', data.action);
        ev.stopImmediatePropagation();
        ev.preventDefault?.();
        return;
      }

      // 4) Any other structured message → swallow defensively
      ev.stopImmediatePropagation();
      ev.preventDefault?.();
    }, true); // capture=true is critical

    // Tell parent we're ready (informational)
    try { window.parent && window.parent.postMessage({ type: 'sf:ready-embed' }, '*'); } catch {}
  } catch (e) {
    console.error('[graph/adapter] failed to init embed mode:', e);
  }
})();
