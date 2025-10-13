// webserver/public/utils/router.js
// Minimal hash-router with active tab highlight and duplicate-render guard.

const routes = new Map();
let started = false;
let lastPath = null;

export function register(path, renderFn) {
  routes.set(path, renderFn);
}

export function startRouter(rootEl, onRouteChange) {
  if (started) return; // start only once
  started = true;

  function render(force = false) {
    const path = location.hash || '#/graph';
    if (!force && path === lastPath) return;
    lastPath = path;

    const fn = routes.get(path) || routes.get('#/graph');
    rootEl.innerHTML = ''; // clear before render
    if (typeof fn === 'function') fn(rootEl);
    highlight(path);
    onRouteChange?.(path);
  }

  window.addEventListener('hashchange', () => render(false));
  render(true);
}

function highlight(path) {
  document.querySelectorAll('.tab').forEach(el => {
    el.classList.toggle('is-active', el.getAttribute('href') === path);
  });
}

