// webserver/public/js/components/sessionsDrawer.js
// Sessions drawer component: creates the drawer and exposes open/close and listEl

export function createSessionsDrawer({ createDrawer }) {
  const backdrop = document.createElement('div');
  backdrop.id = 'sf-sessions-backdrop';
  backdrop.className = 'drawer-backdrop';

  const panel = document.createElement('div');
  panel.id = 'sf-sessions-drawer';
  panel.className = 'drawer-panel drawer-panel--right';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-hidden', 'true');

  panel.innerHTML = `
    <div class="drawer-header">
      <h3>Your sessions</h3>
      <button class="btn" id="sf-sessions-close" aria-label="Close">Close</button>
    </div>
    <div class="helper drawer-subtle">Newest first</div>
    <div id="sf-sessions-list"></div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  const drawer = createDrawer({ backdropEl: backdrop, panelEl: panel });
  const listEl = panel.querySelector('#sf-sessions-list');
  const btnClose = panel.querySelector('#sf-sessions-close');
  btnClose.addEventListener('click', drawer.close);

  function open(prefetch) {
    if (typeof prefetch === 'function') prefetch(listEl);
    drawer.open();
  }

  return { open, close: drawer.close, drawer, listEl };
}

