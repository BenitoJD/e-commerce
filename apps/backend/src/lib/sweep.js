// Background sweep for abandoned checkouts.
//
// Extracted so both the admin endpoint and the interval in index.js run the same logic.
const { transitionOrder } = require('./orderService');
const { DEFAULT_MINUTES } = require('./staleHolds');

const MAX_PER_RUN = 200;

async function sweepStaleHolds(db, { minutes = DEFAULT_MINUTES, limit = MAX_PER_RUN } = {}) {
  const { rows } = await db.query(
    `SELECT id, receipt, status, created_at FROM orders
      WHERE status = 'pending' AND created_at < NOW() - ($1::int * INTERVAL '1 minute')
      ORDER BY created_at ASC LIMIT $2`,
    [minutes, Math.min(Math.max(Number(limit) || MAX_PER_RUN, 1), MAX_PER_RUN)]
  );
  const released = [];
  const skipped = [];
  for (const row of rows) {
    try {
      const result = await transitionOrder(db, row.id, 'cancelled');
      if (result.ok) released.push({ id: row.id, receipt: result.order.receipt });
      else skipped.push({ id: row.id, reason: result.error });
    } catch (e) {
      skipped.push({ id: row.id, reason: e.message });
    }
  }
  return { released, skipped };
}

// Sweep cadence from env: 0 disables it, anything unparseable falls back to the default.
function sweepIntervalMinutes(raw = process.env.STALE_SWEEP_MINUTES, fallback = 15) {
  const n = parseInt(raw, 10);
  if (raw !== undefined && raw !== null && raw !== '' && Number.isInteger(n) && n === 0) return 0;
  if (!Number.isInteger(n) || n < 0) return fallback;
  return Math.min(n, 1440);
}

module.exports = { sweepStaleHolds, sweepIntervalMinutes, MAX_PER_RUN };
