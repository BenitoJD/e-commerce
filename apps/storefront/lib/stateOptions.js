// Checkout state-picker helpers.
//
// The state field is only meaningful when the list actually loaded. If `GET /store/states`
// fails, a `required` empty select would block the whole checkout, so requirement is
// derived from the data, never hardcoded.
export function normalizeStates(response) {
  const rows = Array.isArray(response) ? response : (response && response.states) || [];
  return rows
    .filter((s) => s && s.code && s.name)
    .map((s) => ({ code: String(s.code), name: String(s.name) }));
}

export function stateFieldRequired(options) {
  return Array.isArray(options) && options.length > 0;
}

// The payload value: only send a state that the server will recognise.
export function stateForPayload(options, selectedCode) {
  const code = String(selectedCode || '');
  if (!code) return null;
  const known = Array.isArray(options) && options.some((o) => o.code === code);
  return known ? code : null;
}
