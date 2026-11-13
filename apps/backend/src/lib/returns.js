// Return-window rules, kept pure so the published policy and the code cannot drift apart.
//
// The store's returns policy promises "7 days of delivery". The endpoint previously accepted
// a return for any delivered order regardless of age, and for the same order over and over.
const WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function returnWindow({ deliveredAt = null, createdAt = null, now = new Date(), windowDays = WINDOW_DAYS } = {}) {
  const delivered = toDate(deliveredAt);
  const created = toDate(createdAt);
  const anchor = delivered || created;
  if (!anchor) {
    // No usable timestamp: don't invent a refusal, but say why the window is unknown.
    return { allowed: true, deadline: null, daysLeft: null, anchoredOn: 'none' };
  }
  const deadline = new Date(anchor.getTime() + windowDays * DAY_MS);
  const at = toDate(now) || new Date();
  const allowed = at.getTime() <= deadline.getTime();
  const daysLeft = Math.ceil((deadline.getTime() - at.getTime()) / DAY_MS);
  return {
    allowed,
    deadline,
    daysLeft,
    anchoredOn: delivered ? 'delivery' : 'order',
    windowDays,
  };
}

module.exports = { returnWindow, WINDOW_DAYS };
