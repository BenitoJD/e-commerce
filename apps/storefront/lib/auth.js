'use client';

// Client-side account session. The token is a random 32-byte value stored in localStorage;
// it is sent as a Bearer header. Every helper swallows storage errors so private-mode
// browsers keep the store usable.

const TOKEN_KEY = 'tw_token';
const ORDER_TOKEN_PREFIX = 'tw_order_access:';

export function getToken() {
  if (typeof window === 'undefined') return '';
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function setToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token || ''); } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth-updated'));
}

export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth-updated'));
}

export function orderAccessKey(phone) {
  return `${ORDER_TOKEN_PREFIX}${String(phone || '').replace(/\D/g, '').slice(-10)}`;
}

export function getOrderAccess(phone) {
  try { return sessionStorage.getItem(orderAccessKey(phone)) || ''; } catch { return ''; }
}

export function setOrderAccess(phone, token) {
  try { sessionStorage.setItem(orderAccessKey(phone), token || ''); } catch { /* ignore */ }
}

export function authHeaders(token) {
  const t = token === undefined ? getToken() : token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
