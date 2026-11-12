// Readiness probe: "process is up" (/health) is not the same as "can serve traffic".
// Uptime monitors should watch /ready — it fails when Postgres is unreachable.
function makeReadyHandler(db) {
  return async function readyHandler(req, res) {
    try {
      await db.query('SELECT 1 AS ok');
      res.json({ ok: true, db: 'up' });
    } catch (err) {
      console.error('[ready] database unreachable:', err && err.message);
      res.status(503).json({ ok: false, db: 'down' });
    }
  };
}

module.exports = { makeReadyHandler };
