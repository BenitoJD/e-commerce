// Admin token persistence — one key, one place.
//
// The console and the picking list must agree on both the key and the storage:
// the console keeps the token in sessionStorage, so a page reading localStorage (or a
// different key) silently believes the operator is logged out.
const KEY = 'tk_admin';

function store() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null; // private mode / storage disabled
  }
}

export function getAdminToken() {
  const s = store();
  if (!s) return '';
  try {
    return s.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function setAdminToken(token) {
  const s = store();
  if (!s) return;
  try {
    s.setItem(KEY, String(token || ''));
  } catch { /* ignore quota/private mode */ }
}

export function clearAdminToken() {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(KEY);
  } catch { /* ignore */ }
}

export const ADMIN_TOKEN_KEY = KEY;
