// webserver/public/js/ui/drawer.js
// Drawer panel utilities: createDrawer + registerGlobalAutoClose

export function createDrawer({ backdropEl, panelEl }) {
  if (!backdropEl || !panelEl) throw new Error('createDrawer: missing elements');

  const open = () => {
    backdropEl.classList.add('is-open');
    panelEl.classList.add('is-open');
    panelEl.setAttribute('aria-hidden', 'false');
  };
  const close = () => {
    backdropEl.classList.remove('is-open');
    panelEl.classList.remove('is-open');
    panelEl.setAttribute('aria-hidden', 'true');
  };
  const isOpen = () => panelEl.classList.contains('is-open');

  // Close on ESC / backdrop click
  backdropEl.addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) close();
  });

  return { open, close, isOpen, backdropEl, panelEl };
}

export function registerGlobalAutoClose(drawers) {
  const closeAll = () => drawers.forEach(d => d && d.close && d.close());

  window.addEventListener('message', (e) => {
    const d = e?.data;
    if (d && typeof d === 'object' && d.type === 'sf:navigate') closeAll();
  });
  window.addEventListener('hashchange', closeAll);
  window.addEventListener('popstate', closeAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) closeAll(); });
  window.addEventListener('beforeunload', closeAll);
}

