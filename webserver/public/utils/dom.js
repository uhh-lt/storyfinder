// webserver/public/utils/dom.js
// Small DOM and asset helpers to keep view JS clean of HTML/CSS snippets.

/**
 * Load an HTML file and return either a single root Element
 * or a DocumentFragment when multiple root elements exist.
 * @param {string} path - relative or absolute path to the HTML file
 * @returns {Promise<Element|DocumentFragment>}
 */
export async function loadHtml(path) {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`loadHtml failed (${res.status} ${res.statusText}) for: ${path}`);
  }
  const html = await res.text();
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  // Prefer a single root element; otherwise return the fragment
  return tpl.content.childElementCount === 1
    ? tpl.content.firstElementChild
    : tpl.content;
}

// Note: global styles are linked statically in public/index.html.
// If dynamic stylesheet loading is needed in the future, reintroduce
// a small helper here.

// Note: Global styles are loaded via index.html (styles.css).

/**
 * Replace all children of `root` with `el`.
 * @param {Element} root
 * @param {Element|DocumentFragment} el
 */
export function replaceRoot(root, el) {
  // Modern shortcut with graceful fallback
  if ('replaceChildren' in root) {
    // @ts-ignore - supported on modern browsers
    root.replaceChildren(el);
    return;
  }
  while (root.firstChild) root.removeChild(root.firstChild);
  root.appendChild(el);
}

/**
 * Convenience helper that loads CSS, fetches HTML, mounts it under `root`,
 * runs an optional `onMount` callback, and returns the mounted node.
 * Non-breaking sugar around the primitives above.
 * @param {Object} options
 * @param {Element} options.root - mount point (e.g., document.querySelector('#app'))
 * @param {string} options.htmlPath - path to the HTML file (e.g., './views/login.html')
 * @param {(node: Element|DocumentFragment)=>void} [options.onMount] - optional hook
 * @returns {Promise<Element|DocumentFragment>}
 */
export async function mountView({ root, htmlPath, onMount }) {
  // Global stylesheet is linked in index.html (styles.css).
  const node = await loadHtml(htmlPath);
  replaceRoot(root, node);
  if (typeof onMount === 'function') onMount(node);
  return node;
}
