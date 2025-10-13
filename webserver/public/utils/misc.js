// webserver/public/utils/misc.js
// Consolidated utility helpers used by chat.js and related views.
// This file centralizes small, pure helpers to reduce duplication.

// ---- Time helpers ----
export const time = {
  hhmm(ts) {
    try {
      const d = ts ? new Date(ts) : new Date();
      if (Number.isNaN(d.getTime())) return '';
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    } catch { return ''; }
  },
  ddmmyy(ts) {
    try {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return ts ?? '';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      return `${dd}.${mm}.${yy}`;
    } catch { return ts ?? ''; }
  }
};

// ---- Storage helpers ----
export const keys = {
  sessionId: 'sf.chat.sessionId',
  ctxMode:   'sf.chat.ctx.mode',
  ctxIds:    'sf.chat.ctx.ids',
  ctxCount:  'sf.chat.ctx.count',
  autoSend:  'sf.chat.templates.autoSend',
};

export const storage = {
  get(k, fallback = '') {
    try { const v = sessionStorage.getItem(k); return (v ?? fallback); } catch { return fallback; }
  },
  set(k, v) {
    try { sessionStorage.setItem(k, v ?? ''); } catch {}
  },
  getJSON(k, fallback = []) {
    try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  setJSON(k, obj) {
    try { sessionStorage.setItem(k, JSON.stringify(obj ?? null)); } catch {}
  }
};

// ---- Math helpers ----
export function clamp(n, min, max) {
  n = Number(n) || 0; 
  return Math.min(max, Math.max(min, n));
}

// ---- HTML/text helpers ----
export function normalizeSpaces(s) {
  return String(s).replace(/[\u00A0\u202F\u2007\u2009\u200A\u200B]/g, ' ');
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function mdToHtml(input) {
  if (!input) return '';
  let s = normalizeSpaces(String(input));

  // Helpers
  const formatInline = (txt) => {
    let out = escapeHtml(String(txt || ''));
    out = out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    out = out.replace(/\*(.+?)\*/g, '<i>$1</i>');
    return out;
  };

  const looksLikeTable = (block) => {
    const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return false;
    if (!/\|/.test(lines[0])) return false; // header must contain pipes
    // separator row: pipes + dashes with optional colons
    const sep = lines[1].replace(/^[|]|[|]$/g, '');
    const isSep = sep.split('|').every(c => /^(\s*:?[-]{3,}:?\s*)$/.test(c));
    return isSep;
  };

  const renderTable = (block) => {
    const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
    // Determine alignment from separator row
    const header = lines[0];
    const sep = lines[1];
    const rows = lines.slice(2);

    const splitRow = (row) => row
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(c => c.trim());

    const headers = splitRow(header);
    const aligns = splitRow(sep).map(c => {
      const left = c.trim().startsWith(':');
      const right = c.trim().endsWith(':');
      return right && left ? 'center' : right ? 'right' : 'left';
    });

    const thead = `<thead><tr>${headers.map((h, i) => `<th style="text-align:${aligns[i] || 'left'}">${formatInline(h)}</th>`).join('')}</tr></thead>`;
    const tbodyRows = rows
      .filter(r => /\|/.test(r))
      .map(r => splitRow(r))
      .map(cells => {
        const tds = cells.map((c, i) => `<td style="text-align:${aligns[i] || 'left'}">${formatInline(c)}</td>`).join('');
        return `<tr>${tds}</tr>`;
      })
      .join('');
    const tbody = `<tbody>${tbodyRows}</tbody>`;
    return `<table>${thead}${tbody}</table>`;
  };

  // Split paragraphs/blocks by two or more newlines
  const blocks = s.split(/\n{2,}/);

  const html = blocks.map(block => {
    // Headings (ATX style: # .. ######)
    const m = block.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/s);
    if (m) {
      const level = Math.min(6, Math.max(1, m[1].length));
      const text = m[2];
      return `<h${level}>${formatInline(text)}</h${level}>`;
    }

    // Table detection (GitHub-style pipe tables)
    if (looksLikeTable(block)) {
      return renderTable(block);
    }

    // Bullet list detection
    if (/^\s*([-*\u0007])\s+/m.test(block)) {
      const lines = block.split(/\n/).map(line => line.trim());
      const items = lines
        .filter(l => /^[-*\u0007]\s+/.test(l))
        .map(l => {
          const content = l.replace(/^[-*\u0007]\s+/, '');
          return `<li>${formatInline(content)}</li>`;
        });
      if (items.length > 0) return `<ul>${items.join('')}</ul>`;
    }

    // Fallback paragraph with inline formatting
    return `<p>${formatInline(block)}</p>`;
  });

  return html.join('\n');
}

// ---- SVG Icon helper ----
export function svgIcon(name, color = 'currentColor') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', color);
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const paths = {
    plus:   ['M12 5v14M5 12h14'],
    edit:   ['M3 21h4l11-11-4-4L3 17v4z','M14 6l4 4'],
    trash:  ['M3 6h18M8 6v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6M10 6V4a2 2 0 0 1 4 0v2'],
    copy:   ['M16 16H4V4h12v12zM8 8h12v12H8z'],
    stack:  ['M4 6h16M4 12h16M4 18h16'],
    layers: ['M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 18l9 5 9-5'],
    eye:    ['M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z','M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z']
  };

  (paths[name] || []).forEach(d => {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  });
  return svg;
}

// ---- Network error helper ----
export async function safeErr(res) {
  try { const j = await res.json(); return j?.error || res.statusText; } catch { return res.statusText; }
}
