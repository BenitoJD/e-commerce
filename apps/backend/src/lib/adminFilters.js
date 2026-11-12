// Order filtering for admin lists and the accounting export.
//
// Kept pure so the SQL fragments and parameter order are unit-tested: a mis-numbered
// placeholder here silently returns wrong rows rather than erroring.
const STATUSES = ['pending', 'paid', 'cod_pending', 'cod', 'shipped', 'delivered', 'cancelled', 'refunded', 'failed'];

function parseDate(value, endOfDay = false) {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function buildOrderFilter({ status, from, to, q } = {}) {
  const conds = [];
  const params = [];

  const cleanStatus = String(status || '').trim();
  if (cleanStatus && STATUSES.includes(cleanStatus)) {
    params.push(cleanStatus);
    conds.push(`status = $${params.length}`);
  }

  const fromIso = parseDate(from, false);
  if (fromIso) {
    params.push(fromIso);
    conds.push(`created_at >= $${params.length}`);
  }

  const toIso = parseDate(to, true);
  if (toIso) {
    params.push(toIso);
    conds.push(`created_at <= $${params.length}`);
  }

  const term = String(q || '').trim();
  if (term) {
    params.push(`%${term}%`);
    const n = params.length;
    conds.push(`(receipt ILIKE $${n} OR customer->>'phone' ILIKE $${n} OR customer->>'name' ILIKE $${n})`);
  }

  return {
    where: conds.length ? `WHERE ${conds.join(' AND ')}` : '',
    params,
    // Surfaced so the UI can explain that a malformed date was ignored.
    ignored: {
      from: Boolean(String(from || '').trim()) && !fromIso,
      to: Boolean(String(to || '').trim()) && !toIso,
      status: Boolean(cleanStatus) && !STATUSES.includes(cleanStatus),
    },
  };
}

module.exports = { buildOrderFilter, parseDate, ORDER_STATUSES: STATUSES };
