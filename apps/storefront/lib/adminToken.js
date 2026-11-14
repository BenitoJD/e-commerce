// Admin token persistence, one key, one place.
//
// The console and the picking list must agree on both the key and the storage. The token
// lives in localStorage so a new tab (the picking list opens with target="_blank") is
// already authenticated; sessionStorage is not shared between tabs, which made every
// picking list open on "Admin token missing".
const KEY = 'tk_admin';

function store() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null; // private mode / storage disabled
  }
}

export function getAdminToken() {
  const s = store();
  if (!s) return '';
  try {
    // Migrate a token saved by an older build in sessionStorage.
    const legacy = window.sessionStorage.getItem(KEY);
    if (legacy && !s.getItem(KEY)) s.setItem(KEY, legacy);
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
    window.sessionStorage.removeItem(KEY);
  } catch { /* ignore quota/private mode */ }
}

export function clearAdminToken() {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(KEY);
    window.sessionStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export const ADMIN_TOKEN_KEY = KEY;
