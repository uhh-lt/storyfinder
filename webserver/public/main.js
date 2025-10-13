// public/main.js
import { register, startRouter } from './utils/router.js';
import { setupIncoming, isFramed, notify } from './utils/bridge.js';
import { initAuth, setAuth, fetchMe, state, onAuthChange } from './utils/state.js';

import { renderLogin } from './views/js/login.js';
import { renderRegister } from './views/js/register.js';
import { renderForgot } from './views/js/forgot.js';
import { renderGraph } from './views/js/graph.js';
import { renderChat } from './views/js/chat.js';

register('#/login',     renderLogin);
register('#/register',  renderRegister);
register('#/forgot',    renderForgot);
register('#/graph',     renderGraph);
register('#/chat',      renderChat);

setupIncoming(() => {});

const root        = document.getElementById('app');
const $logout     = document.getElementById('btn-logout');
const $user       = document.getElementById('user-pill');
const $tabLogin   = document.getElementById('tab-login');
const $openTab   = document.getElementById('btn-open-tab');


// blendet "Open in tab" nur im Sidepanel ein, unabhängig von Auth
function syncOpenInTabVisibility() {
  if (!$openTab) return;
  $openTab.style.display = isFramed() ? '' : 'none';
}

// Click: Tab öffnen (über SW) und Sidepanel schließen (wird vom SW ausgelöst)
$openTab?.addEventListener('click', (e) => {
  e.preventDefault();
  try {
    // über unsere Bridge; der Sidepanel listener leitet an den SW weiter
    notify('sf:openInTab', { url: location.origin + '/' });
  } catch {
    // Fallback, falls kein Extension-Kontext: normales window.open
    window.open(location.origin + '/', '_blank');
  }
});

function syncAuthUi() {
  if ($logout)   $logout.style.display   = state.auth ? '' : 'none';
  if ($tabLogin) $tabLogin.style.display = state.auth ? 'none' : '';
  if ($user) {
    if (state.auth && state.user) {
      $user.textContent   = state.user.name || state.user.email || ('User #' + state.user.id);
      $user.style.display = '';
    } else {
      $user.style.display = 'none';
    }
  }
  syncOpenInTabVisibility();
}


// React to auth changes from anywhere (login/logout in other tabs)
onAuthChange(() => {
  syncAuthUi();
  if (state.auth) {
    // if someone logs in elsewhere, leave login/register pages immediately
    if (location.hash === '#/login' || location.hash === '#/register' || location.hash === '#/forgot') {
      location.hash = '#/graph';
    }
  } else {
    // logout → go to login and refresh embed if present
    const iframe = document.querySelector('iframe.embed');
    if (iframe) {
      try { iframe.contentWindow.location.reload(); } catch { iframe.src = iframe.src; }
    }
    if (location.hash !== '#/login') location.hash = '#/login';
  }
  syncOpenInTabVisibility();
});

async function doLogout() {
  try {
    const r = await fetch('/api/logout', { method:'POST', credentials:'include' });
    if (!r.ok) throw new Error('api_logout_not_ok');
  } catch {
    try { await fetch('/logout', { method:'GET', credentials:'include' }); } catch {}
  } finally {
    setAuth(false, null);
  }
}

$logout?.addEventListener('click', (e) => { e.preventDefault(); doLogout(); });
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t && t.id === 'btn-logout') { e.preventDefault(); doLogout(); }
});

// Boot: init auth without broadcasting, then start router once
(async () => {
  const me = await fetchMe();
  initAuth(me.auth, me.user);    // <-- no broadcast on boot
  startRouter(root, (path) => {
    const needsAuth = (path === '#/graph' || path === '#/chat');
    if (needsAuth && !state.auth) {
      if (location.hash !== '#/login') location.hash = '#/login';
    }
    if ((path === '#/login' || path === '#/register' || path === '#/forgot') && state.auth) {
      location.hash = '#/graph';
    }
    syncAuthUi();
  });

  // Default route only if nothing set
  if (!location.hash || location.hash === '#/') {
    location.hash = state.auth ? '#/graph' : '#/login';
  } else {
    syncAuthUi();
  }
})();
