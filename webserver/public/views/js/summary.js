export function renderSummary(root) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `
    <h1>Summary – Platzhalter</h1>
    <p>Hier erscheint später eine Übersicht der gespeicherten Zusammenfassungen.</p>
    <p class="helper">Geplante Funktionen: Filter, Suche, Open‑in‑Tab, Bearbeiten, Sync mit Plugin.</p>
  `;
  root.appendChild(el);
}
