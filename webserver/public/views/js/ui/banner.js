// webserver/public/js/ui/banner.js
// Lightweight banner overlay service used by chat.js to show transient messages.

export function createBanner(container) {
  const root = container || document.body;
  const el = document.createElement('div');
  el.id = 'sf-banner';
  el.className = 'sf-banner';
  // Insert at the top so sticky positioning keeps it visible when scrolling
  try { root.prepend(el); } catch (_) { root.appendChild(el); }

  let timer = 0;
  function clear() {
    try { if (timer) { clearTimeout(timer); timer = 0; } } catch {}
    el.classList.remove('is-visible');
    setTimeout(() => { el.textContent = ''; }, 200);
  }
  function show(type, text, opts = {}) {
    try { if (timer) { clearTimeout(timer); timer = 0; } } catch {}
    el.textContent = String(text ?? '');
    el.classList.remove('is-error', 'is-info');
    el.classList.add(type === 'error' ? 'is-error' : 'is-info');
    requestAnimationFrame(() => { el.classList.add('is-visible'); });
    const ms = Number(opts.duration ?? (type === 'error' ? 4500 : 2000));
    if (ms > 0 && Number.isFinite(ms)) timer = setTimeout(() => clear(), ms);
  }

  return { show, clear, el };
}
