// webserver/public/js/components/headerActions.js
// Header actions component: renders chat header buttons and manages visibility/disabled states.

export function createHeaderActions({ container, svgIcon, uiState, tooltips, handlers }) {
  const headerButtons = new Map(); // id -> HTMLButtonElement

  function createHeaderButton({ id, label, title, icon, onClick, color }) {
    const btn = document.createElement('button');
    btn.id = `sf-btn-${id}`;
    btn.className = 'btn';
    btn.title = title || label;
    if (icon && typeof svgIcon === 'function') btn.appendChild(svgIcon(icon, color || 'currentColor'));
    const span = document.createElement('span');
    span.className = 'sf-btn-label';
    span.textContent = label;
    btn.appendChild(span);
    btn.addEventListener('click', (e) => {
      if (uiState.busy) return;
      try { onClick && onClick(e); } catch (err) { console.error(err); }
    });
    headerButtons.set(id, btn);
    return btn;
  }

  const ACTIONS = [
    { id: 'new',      label: 'New session',  icon: 'plus',  title: tooltips.new,      onClick: handlers.onNew,          when: () => true },
    { id: 'sessions', label: 'Sessions',     icon: 'stack', title: tooltips.sessions, onClick: handlers.onOpenSessions, when: () => true },
    { id: 'context',  label: 'Context',      icon: 'layers',title: tooltips.context,  onClick: handlers.onOpenContext,  when: () => true },
    { id: 'showctx',  label: 'Show context', icon: 'eye',   title: tooltips.preview,  onClick: handlers.onShowContext,  when: () => true },
    { id: 'rename',   label: 'Rename',       icon: 'edit',  title: tooltips.rename,   onClick: handlers.onRename,       when: s => !!s.sessionId, color: 'rgba(17, 121, 72, 0.86)' },
    { id: 'delete',   label: 'Delete',       icon: 'trash', title: tooltips.delete,   onClick: handlers.onDelete,       when: s => !!s.sessionId, color: 'rgba(151, 32, 32, 1)' }
  ];

  function render() {
    if (!container) return;
    container.innerHTML = '';
    ACTIONS.forEach(cfg => {
      const btn = createHeaderButton(cfg);
      container.appendChild(btn);
    });
    update();
  }

  function update() {
    ACTIONS.forEach(cfg => {
      const btn = headerButtons.get(cfg.id);
      if (!btn) return;
      const visible = cfg.when ? !!cfg.when(uiState) : true;
      btn.style.display = visible ? '' : 'none';
      btn.disabled = uiState.busy ? true : false;
    });
  }

  function visibleCount() {
    let n = 0;
    ACTIONS.forEach(cfg => {
      const btn = headerButtons.get(cfg.id);
      if (btn && btn.style.display !== 'none') n++;
    });
    return Math.min(5, Math.max(3, n || 3));
  }

  return { render, update, visibleCount };
}

