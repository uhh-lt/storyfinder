// public/views/graph.js
export function renderGraph(root) {
  // Embed the copied graph app via iframe
  const bar = document.createElement('div');
  bar.style = 'display:flex;gap:8px;margin:0 0 8px 0';
  bar.innerHTML = `
    <button class="btn" id="btn-reload-graph">Neu laden</button>
  `;
  bar.querySelector('#btn-reload-graph').addEventListener('click', () => {
    iframe.contentWindow?.location?.reload();
  });

  const iframe = document.createElement('iframe');
  iframe.className = 'embed';
  iframe.title = 'Graph';
  iframe.src = '/graph?embed=1';
  iframe.addEventListener('load', () => {
  // Nudge relayout (both protocols to be safe)
  try {
    iframe.contentWindow.postMessage({ type: 'app:relayout' }, '*');
    iframe.contentWindow.postMessage({ action: 'relayout' }, '*');
  } catch {}
   });

  // Auto-reload when the embedded graph asks for it
  window.addEventListener('message', (ev) => {
    const data = ev.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'sf:request-graph-reload') {
      try { iframe.contentWindow?.location?.reload(); } catch {}
    }
  });

  window.addEventListener('resize', () => {
    try {
      iframe.contentWindow.postMessage({ type: 'app:relayout' }, '*');
      iframe.contentWindow.postMessage({ action: 'relayout' }, '*');
    } catch {}
  });

  root.appendChild(bar);
  root.appendChild(iframe);
}
