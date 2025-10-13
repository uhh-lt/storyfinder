// webserver/public/views/js/components/templateActions.js
// Renders chat template actions with minimal UI and an inline caret for options.
// Exposes a compact API so chat.js remains lean.

import { storage, keys } from '../../../utils/misc.js';

const TPL_STORE_PREFIX = 'sf.chat.tpl.';

function tplGet(prefix, key, defVal) {
  try {
    const v = storage.get(TPL_STORE_PREFIX + prefix + '.' + key, '');
    return v !== '' ? v : String(defVal ?? '');
  } catch { return String(defVal ?? ''); }
}
function tplSet(prefix, key, val) {
  try { storage.set(TPL_STORE_PREFIX + prefix + '.' + key, String(val ?? '')); } catch {}
}

function createSelect(options) {
  const sel = document.createElement('select');
  options.forEach(({ value, label }) => {
    const o = document.createElement('option');
    o.value = String(value);
    o.textContent = String(label);
    sel.appendChild(o);
  });
  return sel;
}

function defaultTranslateLanguage() {
  try {
    const lang = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (lang.startsWith('de')) return 'German';
    if (lang.startsWith('es')) return 'Spanish';
    if (lang.startsWith('fr')) return 'French';
    if (lang.startsWith('it')) return 'Italian';
    if (lang.startsWith('pt')) return 'Portuguese';
    return 'German';
  } catch { return 'German'; }
}

export function createTemplateActions({
  container,
  getCtxMode,
  getCtxSelectedIds,
  getCtxCount,
  onPrompt,
}) {
  // Auto-Send toggle is managed here and persisted
  let autoSendEnabled = false;
  try { autoSendEnabled = (storage.get(keys.autoSend, '0') === '1'); } catch {}
  function writeAutoSend(v) {
    autoSendEnabled = !!v;
    try { storage.set(keys.autoSend, autoSendEnabled ? '1' : '0'); } catch {}
  }

  // Popover menu infra
  let _openMenu = null;
  function closeOpenMenu() {
    if (_openMenu && _openMenu.parentNode) {
      try { document.body.removeChild(_openMenu); } catch {}
    }
    _openMenu = null;
    document.removeEventListener('click', onDocClickClose, true);
    window.removeEventListener('resize', closeOpenMenu);
    window.removeEventListener('scroll', closeOpenMenu, true);
  }
  function onDocClickClose(e) {
    if (!_openMenu) return;
    if (_openMenu.contains(e.target)) return;
    closeOpenMenu();
  }
  function openOptionsMenu(anchorEl, schema, prefix, onApply) {
    closeOpenMenu();
    const r = anchorEl.getBoundingClientRect();
    const menu = document.createElement('div');
    _openMenu = menu;
    Object.assign(menu.style, {
      position: 'fixed',
      top: `${Math.round(r.bottom + 6)}px`,
      left: `${Math.max(8, Math.round(r.right - 260))}px`,
      width: '252px', zIndex: 2200,
      background: '#0c1330', border: '1px solid #23335f', borderRadius: '10px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.45)', padding: '10px', display: 'grid', gap: '8px',
    });
    const header = document.createElement('div'); header.className = 'helper'; header.textContent = 'Options'; menu.appendChild(header);
    const fields = [];
    (schema || []).forEach(field => {
      const wrap = document.createElement('label'); wrap.style.display = 'grid'; wrap.style.gap = '4px';
      const lab = document.createElement('span'); lab.className = 'helper'; lab.textContent = field.label; wrap.appendChild(lab);
      let inputEl = null;
      if (field.type === 'select') { inputEl = createSelect(field.options); inputEl.value = tplGet(prefix, field.key, field.default); }
      else if (field.type === 'checkbox') { inputEl = document.createElement('input'); inputEl.type = 'checkbox'; inputEl.checked = tplGet(prefix, field.key, field.default ? '1' : '0') === '1'; }
      else if (field.type === 'text') { inputEl = document.createElement('input'); inputEl.type = 'text'; inputEl.placeholder = field.placeholder || ''; inputEl.value = tplGet(prefix, field.key, field.default || ''); }
      if (inputEl) wrap.appendChild(inputEl);
      menu.appendChild(wrap);
      fields.push({ field, el: inputEl });
    });
    const row = document.createElement('div'); row.style.display = 'flex'; row.style.justifyContent = 'flex-end'; row.style.gap = '8px';
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'btn'; cancelBtn.textContent = 'Cancel';
    const applyBtn = document.createElement('button'); applyBtn.className = 'btn'; applyBtn.textContent = 'Apply';
    row.appendChild(cancelBtn); row.appendChild(applyBtn); menu.appendChild(row);
    cancelBtn.addEventListener('click', closeOpenMenu);
    applyBtn.addEventListener('click', () => {
      const opts = {};
      fields.forEach(({ field, el }) => {
        if (!el) return; let val = '';
        if (field.type === 'checkbox') val = el.checked ? '1' : '0'; else val = String(el.value || '');
        tplSet(prefix, field.key, val);
        opts[field.key] = val;
      });
      closeOpenMenu();
      try { onApply && onApply(opts); } catch {}
    });
    document.body.appendChild(menu);
    setTimeout(() => { document.addEventListener('click', onDocClickClose, true); window.addEventListener('resize', closeOpenMenu); window.addEventListener('scroll', closeOpenMenu, true); }, 0);
  }

  function createInlineCaretButton({ label, prefix, schema, compose, disabledReason }) {
    const main = document.createElement('button');
    main.className = 'btn';
    main.type = 'button';
    main.textContent = label;
    if (disabledReason) { main.disabled = true; main.title = disabledReason; }
    main.style.position = 'relative';
    main.style.paddingRight = '26px';
    const caretSpan = document.createElement('span');
    caretSpan.textContent = '▾'; caretSpan.title = 'Options';
    Object.assign(caretSpan.style, { position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', opacity: '0.9', fontSize: '12px', pointerEvents: 'auto' });
    main.appendChild(caretSpan);
    main.addEventListener('click', (ev) => {
      if (ev.target === caretSpan) {
        if (disabledReason) return;
        openOptionsMenu(caretSpan, schema || [], prefix, (opts) => {
          const prompt = compose(opts);
          onPrompt && onPrompt(prompt, { autoSend: !!autoSendEnabled });
        });
        return;
      }
      const opts = {};
      (schema || []).forEach(f => {
        if (f.type === 'checkbox') opts[f.key] = tplGet(prefix, f.key, f.default ? '1' : '0');
        else opts[f.key] = tplGet(prefix, f.key, f.default);
      });
      const prompt = compose(opts);
      onPrompt && onPrompt(prompt, { autoSend: !!autoSendEnabled });
    });
    return main;
  }

  function countContextSources() {
    const mode = getCtxMode();
    if (mode === 'manual') return (Array.isArray(getCtxSelectedIds()) ? getCtxSelectedIds().length : 0);
    if (mode === 'recent' || mode === 'domain') return Number(getCtxCount() || 0);
    return 1;
  }

  function render() {
    if (!container) return;
    container.innerHTML = '';
    const row = document.createElement('div'); row.className = 'actions';

    // Summarize
    row.appendChild(createInlineCaretButton({
      label: 'Summarize', prefix: 'summarize',
      schema: [
        { type: 'select', key: 'length', label: 'Length', default: 'short', options: [
          { value: 'very short', label: 'Very short' }, { value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'long', label: 'Long' },
        ]},
        { type: 'select', key: 'form', label: 'Form', default: 'bullets', options: [
          { value: 'bullets', label: 'Bullets' }, { value: 'paragraph', label: 'Paragraph' },
        ]},
        { type: 'select', key: 'audience', label: 'Audience', default: 'general', options: [
          { value: 'general', label: 'General' }, { value: 'expert', label: 'Expert' },
        ]},
      ],
      compose: (o) => `Create a ${o.length || 'short'} ${o.form || 'bullets'} summary for a ${o.audience || 'general'} reader, based on the loaded sources. Provide 5–7 key points with brief justifications and bracketed source markers like [1], [2]. If information is missing, state it clearly. Only use the loaded context.\n`,
    }));

    // Translate
    row.appendChild(createInlineCaretButton({
      label: 'Translate', prefix: 'translate',
      schema: [ { type: 'text', key: 'lang', label: 'Language', default: defaultTranslateLanguage(), placeholder: 'e.g., German' } ],
      compose: (o) => `Translate the key points from the loaded context into ${o.lang || defaultTranslateLanguage()}. Preserve meaning and tone. Do not add explanations; output only the translation. Keep bracketed source markers like [1], [2]. Only use the loaded context.\n`,
    }));

    // Polish
    row.appendChild(createInlineCaretButton({
      label: 'Polish', prefix: 'polish',
      schema: [
        { type: 'select', key: 'strength', label: 'Strength', default: 'medium', options: [ { value: 'light', label: 'Light' }, { value: 'medium', label: 'Medium' }, { value: 'strong', label: 'Strong' } ] },
        { type: 'select', key: 'tone', label: 'Tone', default: 'neutral', options: [ { value: 'neutral', label: 'Neutral' }, { value: 'formal', label: 'Formal' }, { value: 'friendly', label: 'Friendly' } ] },
      ],
      compose: (o) => `Rewrite the key content from the loaded context with ${o.strength || 'medium'} strength to be clearer, cohesive, and stylistically improved, in a ${o.tone || 'neutral'} tone. Do not invent information; condense and clarify only. Preserve bracketed source markers like [1], [2]. Only use the loaded context.\n`,
    }));

    // Fact-check
    row.appendChild(createInlineCaretButton({
      label: 'Fact-check', prefix: 'factcheck',
      schema: [
        { type: 'select', key: 'strict', label: 'Strictness', default: 'strict', options: [ { value: 'strict', label: 'Strict' }, { value: 'standard', label: 'Standard' } ] },
        { type: 'select', key: 'scope', label: 'Scope', default: 'top5', options: [ { value: 'top5', label: 'Top 5 claims' }, { value: 'all', label: 'All major claims' } ] },
        { type: 'select', key: 'format', label: 'Format', default: 'bullets', options: [ { value: 'bullets', label: 'Bullets' }, { value: 'table', label: 'Table' } ] },
      ],
      compose: (o) => `Identify ${o.scope === 'all' ? 'all major' : 'the top 5'} claims in the loaded context. For each (${o.format || 'bullets'} format): (1) Claim; (2) Verdict: ${o.strict === 'strict' ? 'true/uncertain/false without speculation' : 'true/uncertain/false'}; (3) Rationale with direct evidence; (4) Source markers [1], [2]. If the context is insufficient, mark as such. Only use the loaded context.\n`,
    }));

    // Compare/Contrast (needs 2+ sources)
    const compareDisabled = countContextSources() < 2 ? 'Needs at least 2 sources to compare' : '';
    row.appendChild(createInlineCaretButton({
      label: 'Compare/Contrast', prefix: 'compare', disabledReason: compareDisabled || null,
      schema: [
        { type: 'select', key: 'format', label: 'Format', default: 'table', options: [ { value: 'table', label: 'Table' }, { value: 'bullets', label: 'Bullets' } ] },
        { type: 'select', key: 'focus', label: 'Focus', default: 'all', options: [ { value: 'all', label: 'All sources' }, { value: 'top_recent', label: 'Top by recency' } ] },
      ],
      compose: (o) => `Compare similarities and differences across the loaded sources in ${o.format || 'table'} format (${o.focus === 'top_recent' ? 'focus on most recent sources' : 'consider all sources'}). Provide clear sections for Similarities and Differences. Cite bracketed source markers like [1], [2]. Only use the loaded context.\n`,
    }));

    // Key Insights
    row.appendChild(createInlineCaretButton({
      label: 'Key Insights', prefix: 'insights',
      schema: [
        { type: 'select', key: 'count', label: 'Count', default: '5', options: [ { value: '3', label: '3' }, { value: '5', label: '5' }, { value: '10', label: '10' } ] },
        { type: 'select', key: 'depth', label: 'Depth', default: 'brief_why', options: [ { value: 'brief', label: 'Brief only' }, { value: 'brief_why', label: 'Brief + why' } ] },
      ],
      compose: (o) => `Extract the Top-${o.count || '5'} insights from the loaded context${o.depth === 'brief_why' ? ', each with a brief rationale' : ''}. Include a bracketed source marker like [1], [2] for each. Only use the loaded context.\n`,
    }));

    // Pros & Cons
    row.appendChild(createInlineCaretButton({
      label: 'Pros & Cons', prefix: 'proscons',
      schema: [
        { type: 'select', key: 'count', label: 'Items per side', default: '5', options: [ { value: '3', label: '3' }, { value: '5', label: '5' }, { value: '10', label: '10' } ] },
        { type: 'checkbox', key: 'neutral', label: 'Include neutral summary', default: '0' },
      ],
      compose: (o) => `List the key pros and cons derived from the loaded context${(o.count && o.count !== '5') ? ` (about ${o.count} per side)` : ''}. Present them as two subsections (Pros and Cons)${o.neutral === '1' ? ', plus a neutral summary' : ''}. Cite bracketed source markers like [1], [2]. Only use the loaded context.\n`,
    }));

    // Glossary
    row.appendChild(createInlineCaretButton({
      label: 'Glossary', prefix: 'glossary',
      schema: [
        { type: 'select', key: 'count', label: 'Items', default: '10', options: [ { value: '5', label: '5' }, { value: '10', label: '10' }, { value: '20', label: '20' } ] },
        { type: 'checkbox', key: 'acronyms', label: 'Include acronyms', default: '1' },
      ],
      compose: (o) => `Create a glossary of important terms and entities found in the loaded context${(o.count && o.count !== '10') ? ` (approx. ${o.count} items)` : ''}${o.acronyms === '1' ? ', including acronyms' : ''}. Provide a one-sentence definition for each and include a bracketed source marker like [1], [2]. Only use the loaded context.\n`,
    }));

    // Timeline
    row.appendChild(createInlineCaretButton({
      label: 'Timeline', prefix: 'timeline',
      schema: [
        { type: 'select', key: 'granularity', label: 'Granularity', default: 'month', options: [ { value: 'year', label: 'Year' }, { value: 'month', label: 'Month' }, { value: 'day', label: 'Day' } ] },
        { type: 'select', key: 'max', label: 'Max items', default: '10', options: [ { value: '5', label: '5' }, { value: '10', label: '10' }, { value: '20', label: '20' } ] },
        { type: 'select', key: 'order', label: 'Order', default: 'asc', options: [ { value: 'asc', label: 'Ascending' }, { value: 'desc', label: 'Descending' } ] },
      ],
      compose: (o) => `Create a chronological timeline (${o.granularity || 'month'} granularity, max ${o.max || '10'} items, ${o.order === 'desc' ? 'most recent first' : 'oldest first'}) of relevant events and dates found in the loaded context. Include a brief description for each item and a bracketed source marker like [1], [2]. Only use the loaded context.\n`,
    }));

    // Spacer + Auto-Send toggle
    const spacer = document.createElement('div'); spacer.style.flex = '1 1 auto'; row.appendChild(spacer);
    const toggleWrap = document.createElement('label'); toggleWrap.className = 'helper'; Object.assign(toggleWrap.style, { display: 'inline-flex', alignItems: 'center', gap: '6px' });
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!autoSendEnabled; cb.addEventListener('change', () => writeAutoSend(cb.checked));
    const lab = document.createElement('span'); lab.textContent = 'Auto-Send';
    toggleWrap.appendChild(cb); toggleWrap.appendChild(lab); row.appendChild(toggleWrap);

    container.appendChild(row);
  }

  return {
    render,
    update: render,
    isAutoSendEnabled: () => !!autoSendEnabled,
  };
}

