// Unified API helpers
import { loadServerCreds } from './storage.js';

export function normalizeBase(base) {
  return (base || '').replace(/\/$/, '');
}

async function parseJsonSafe(resp) {
  try {
    return await resp.json();
  } catch (_) {
    return { _raw: true };
  }
}

function errorWithStatus(message, status, data) {
  const err = new Error(message || 'Request failed');
  err.status = status;
  if (data !== undefined) err.data = data;
  return err;
}

export async function apiPATCH(path, body) {
  const cfg = await loadServerCreds();
  if (!cfg.serverInitialized || !cfg.server) throw new Error('Server URL missing');

  const url = normalizeBase(cfg.server) + path;
  const res = await fetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) throw errorWithStatus(data?.error || 'Request failed', res.status, data);
  return data;
}

export async function apiDELETE(path) {
  const cfg = await loadServerCreds();
  if (!cfg.serverInitialized || !cfg.server) throw new Error('Server URL missing');

  const url = normalizeBase(cfg.server) + path;
  const res = await fetch(url, {
    method: 'DELETE',
    credentials: 'include'
  });
  const data = await parseJsonSafe(res);
  if (!res.ok) throw errorWithStatus(data?.error || 'Request failed', res.status, data);
  return data;
}

export async function getJsonWithCookies(path) {
  const cfg = await loadServerCreds();
  if (!cfg.serverInitialized || !cfg.server) {
    return { ok: false, status: 0, payload: { error: 'Server URL missing' } };
  }
  const url = normalizeBase(cfg.server) + path;
  const resp = await fetch(url, { method: 'GET', credentials: 'include' });
  const payload = await parseJsonSafe(resp);
  return { ok: resp.ok, status: resp.status, payload };
}

export async function postJsonWithCookies(path, bodyObj) {
  const cfg = await loadServerCreds();
  if (!cfg.serverInitialized || !cfg.server) {
    return { ok: false, status: 0, payload: { error: 'Server URL missing' } };
  }
  const url = normalizeBase(cfg.server) + path;
  const resp = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj || {})
  });
  const payload = await parseJsonSafe(resp);
  return { ok: resp.ok, status: resp.status, payload };
}

