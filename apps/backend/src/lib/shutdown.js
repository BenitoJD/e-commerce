// Graceful shutdown for the API process.
//
// Without this a redeploy (`docker compose up -d --build`) or a container stop kills
// in-flight checkouts and webhooks mid-transaction, and the Postgres pool is never drained.
// The sequence: stop accepting connections, let in-flight requests finish, drain the pool,
// then exit. A hard deadline guarantees the process still dies if a request hangs.
function createShutdown({ server, pool, interval, timeoutMs = 10000, log = console.log } = {}) {
  let started = false;

  return function shutdown(signal = 'SIGTERM', { exit = (code) => process.exit(code) } = {}) {
    if (started) {
      log(`[shutdown] already in progress (${signal})`);
      return Promise.resolve(false);
    }
    started = true;
    log(`[shutdown] ${signal} received — draining`);

    // Stop the background sweep first so it can't touch the DB while the pool drains.
    if (interval && typeof interval === 'object' && typeof interval[Symbol.dispose] !== 'undefined') {
      try { interval[Symbol.dispose](); } catch { /* ignore */ }
    } else if (interval && typeof interval === 'object' && typeof interval.close === 'function') {
      try { interval.close(); } catch { /* ignore */ }
    }

    const hardStop = setTimeout(() => {
      log('[shutdown] deadline reached — forcing exit');
      exit(1);
    }, timeoutMs);
    if (hardStop && typeof hardStop.unref === 'function') hardStop.unref();

    const closeServer = new Promise((resolve) => {
      if (!server || typeof server.close !== 'function') return resolve();
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
    });

    return closeServer
      .then(() => (pool && typeof pool.end === 'function' ? pool.end() : null))
      .then(() => {
        clearTimeout(hardStop);
        log('[shutdown] clean exit');
        exit(0);
        return true;
      })
      .catch((err) => {
        clearTimeout(hardStop);
        log(`[shutdown] pool drain failed: ${err && err.message}`);
        exit(1);
        return false;
      });
  };
}

module.exports = { createShutdown };
