// webserver/public/utils/state.js
// Auth state + cross-tab sync + 401-aware fetch.
// Prevent double renders by: no broadcast on boot init, broadcast only on change.

export const state = {
  auth: false,
  user: null,
};

const listeners = new Set();
export function onAuthChange(fn){ listeners.add(fn); return () => listeners.delete(fn); }
function emitAuth(){ listeners.forEach(fn => { try{ fn(state); }catch{} }); }

// --- Cross-tab channel ---
const instanceId = Math.random().toString(36).slice(2);
const bc = new BroadcastChannel('sf-auth');

bc.onmessage = (ev) => {
  const msg = ev.data || {};
  if (!msg || msg.source === instanceId) return; // ignore our own echoes
  if (msg.type === 'login') {
    internalSetAuth(true, msg.user || null, /*broadcast*/ false);
  } else if (msg.type === 'logout') {
    internalSetAuth(false, null, /*broadcast*/ false);
  }
};

function broadcastAuth(type, user=null){
  try { bc.postMessage({ type, user, source: instanceId }); } catch {}
}

function shallowEqualUser(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.email === b.email && a.name === b.name;
}

function internalSetAuth(auth, user, broadcast){
  const changed = (state.auth !== !!auth) || !shallowEqualUser(state.user, user || null);
  state.auth = !!auth;
  state.user = user || null;
  if (broadcast && changed) broadcastAuth(state.auth ? 'login' : 'logout', state.user);
  if (changed) emitAuth();
}

// Use this for normal changes ��' may broadcast
export function setAuth(auth, user = null) {
  internalSetAuth(auth, user, /*broadcast*/ true);
}

// Use this once at boot to avoid noisy broadcasts
export function initAuth(auth, user = null) {
  internalSetAuth(auth, user, /*broadcast*/ false);
}

// Auth status fetch (read)
export async function fetchMe() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    return await res.json();
  } catch {
    return { auth: false, user: null };
  }
}

/** apiFetch: always include credentials; on 401 ��' logout + redirect */
export async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (res.status === 401) {
    internalSetAuth(false, null, /*broadcast*/ true);
    try { location.hash = '#/login'; } catch {}
    throw new Error('unauthorized');
  }
  return res;
}

