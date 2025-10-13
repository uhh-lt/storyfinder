// webserver/public/js/components/contextDrawer.js
// Context drawer component: builds UI for context mode selection and exposes elements.

export function createContextDrawer({ createDrawer, IN_PANEL, CFG, getCtxMode, setCtxMode, getCtxCount, setCtxCount, getSelectedIds, setSelectedIds, onOpenManualLoad }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'drawer-backdrop';

  const panel = document.createElement('div');
  panel.className = 'drawer-panel drawer-panel--right';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-hidden', 'true');

  const radiosHtml = IN_PANEL
    ? `
      <label><input type="radio" name="sf-ctx-mode" value="current"> Current page</label>
      <label><input type="radio" name="sf-ctx-mode" value="domain"> Recent from this domain</label>
      <label><input type="radio" name="sf-ctx-mode" value="recent"> Recent overall</label>
      <label><input type="radio" name="sf-ctx-mode" value="manual"> Manual selection</label>
    `
    : `
      <label><input type="radio" name="sf-ctx-mode" value="recent"> Recent overall</label>
      <label><input type="radio" name="sf-ctx-mode" value="manual"> Manual selection</label>
    `;

  panel.innerHTML = `
    <div class="drawer-header">
      <h3>Context</h3>
      <button class="btn" id="sf-ctx-close">Close</button>
    </div>

    <fieldset class="ctx-fieldset">
      ${radiosHtml}
    </fieldset>

    <div id="sf-ctx-count-row">
      <span class="helper">Number of pages:</span>
      <select id="sf-ctx-count"></select>
    </div>

    <div id="sf-ctx-manual">
      <div class="ctx-row">
        <div class="helper">Pick from recent articles</div>
        ${IN_PANEL ? `
          <label class="helper">
            <input type="checkbox" id="sf-ctx-only-domain"> Only current domain
          </label>` : ``}
      </div>
      <div id="sf-ctx-list"></div>
      <div class="ctx-actions-row">
        <button class="btn" id="sf-ctx-cancel">Cancel</button>
        <button class="btn" id="sf-ctx-apply">Apply</button>
      </div>
    </div>
    <div id="sf-ctx-actions-generic" class="ctx-actions-row">
      <button class="btn" id="sf-ctx-cancel2">Cancel</button>
      <button class="btn" id="sf-ctx-apply2">Apply</button>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  const drawer = createDrawer({ backdropEl: backdrop, panelEl: panel });

  const els = {
    closeBtn: panel.querySelector('#sf-ctx-close'),
    countRow: panel.querySelector('#sf-ctx-count-row'),
    countSel: panel.querySelector('#sf-ctx-count'),
    manualBox: panel.querySelector('#sf-ctx-manual'),
    list:     panel.querySelector('#sf-ctx-list'),
    onlyDom:  panel.querySelector('#sf-ctx-only-domain'),
    apply:    panel.querySelector('#sf-ctx-apply'),
    cancel:   panel.querySelector('#sf-ctx-cancel'),
    actionsGeneric: panel.querySelector('#sf-ctx-actions-generic'),
    apply2:  panel.querySelector('#sf-ctx-apply2'),
    cancel2: panel.querySelector('#sf-ctx-cancel2'),
  };

  // Build count options
  els.countSel.innerHTML = '';
  for (let i = CFG.CTX_COUNT_MIN; i <= CFG.CTX_COUNT_MAX; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = String(i);
    if (i === getCtxCount()) opt.selected = true;
    els.countSel.appendChild(opt);
  }
  els.countSel.addEventListener('change', () => setCtxCount(els.countSel.value));

  // Mode handling & list wiring
  panel.addEventListener('change', (e) => {
    if (e.target && e.target.name === 'sf-ctx-mode') {
      setCtxMode(e.target.value);
      els.manualBox.style.display = (getCtxMode() === 'manual') ? 'block' : 'none';
      const showCount = IN_PANEL ? (getCtxMode() === 'domain' || getCtxMode() === 'recent') : (getCtxMode() === 'recent');
      els.countRow.style.display  = showCount ? 'flex' : 'none';
      if (els.actionsGeneric) els.actionsGeneric.style.display = (getCtxMode() !== 'manual') ? 'block' : 'none';
      if (getCtxMode() === 'manual') {
        const onlyDom = (IN_PANEL && els.onlyDom) ? (els.onlyDom.checked === true) : false;
        if (typeof onOpenManualLoad === 'function') onOpenManualLoad(onlyDom, els.list);
      }
    }
  });
  if (IN_PANEL && els.onlyDom) {
    els.onlyDom.addEventListener('change', () => {
      if (els.manualBox.style.display === 'block' && typeof onOpenManualLoad === 'function') onOpenManualLoad(els.onlyDom.checked === true, els.list);
    });
  }

  function refreshApplyState() {
    if (!els.apply) return;
    const sel = [...els.list.querySelectorAll('input[type="checkbox"][data-id]:checked')].length;
    els.apply.disabled = (sel === 0);
    els.apply.textContent = sel > 0 ? `Apply (${sel})` : 'Apply';
  }
  els.list.addEventListener('change', (e) => {
    if (e.target && e.target.matches('input[type="checkbox"][data-id]')) refreshApplyState();
  });

  els.cancel.addEventListener('click', drawer.close);
  els.apply.addEventListener('click', () => {
    const ids = [...els.list.querySelectorAll('input[type="checkbox"][data-id]:checked')].map(x => Number(x.dataset.id));
    setSelectedIds(ids);
    drawer.close();
  });
  if (els.cancel2) els.cancel2.addEventListener('click', drawer.close);
  if (els.apply2) els.apply2.addEventListener('click', () => {
    const checked = panel.querySelector('input[name="sf-ctx-mode"]:checked');
    if (checked) setCtxMode(checked.value);
    if (els.countSel && els.countRow.style.display !== 'none') setCtxCount(els.countSel.value);
    drawer.close();
  });
  els.closeBtn.addEventListener('click', drawer.close);

  function open() {
    [...panel.querySelectorAll('input[name="sf-ctx-mode"]')].forEach(r => { r.checked = (r.value === getCtxMode()); });
    els.manualBox.style.display = (getCtxMode() === 'manual') ? 'block' : 'none';
    const showCount = IN_PANEL ? (getCtxMode() === 'domain' || getCtxMode() === 'recent') : (getCtxMode() === 'recent');
    els.countRow.style.display  = showCount ? 'flex' : 'none';
    if (els.actionsGeneric) els.actionsGeneric.style.display = (getCtxMode() !== 'manual') ? 'block' : 'none';
    if (getCtxMode() === 'manual') {
      const onlyDom = (IN_PANEL && els.onlyDom) ? (els.onlyDom.checked === true) : false;
      if (typeof onOpenManualLoad === 'function') onOpenManualLoad(onlyDom, els.list);
    }
    drawer.open();
  }

  return { open, close: drawer.close, drawer, els };
}

