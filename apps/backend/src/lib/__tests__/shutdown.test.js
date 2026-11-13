const test = require('node:test');
const assert = require('node:assert/strict');
const { createShutdown } = require('../shutdown');

function harness({ timeoutMs = 50 } = {}) {
  const calls = { close: 0, end: 0, exit: [], logs: [] };
  const server = { close(cb) { calls.close += 1; setImmediate(cb); } };
  const pool = { end() { calls.end += 1; return Promise.resolve(); } };
  const shutdown = createShutdown({
    server,
    pool,
    timeoutMs,
    log: (m) => calls.logs.push(m),
  });
  const exit = (code) => calls.exit.push(code);
  return { calls, shutdown, exit };
}

test('shutdown stops accepting connections, drains the pool, then exits 0', async () => {
  const { calls, shutdown, exit } = harness();
  const done = await shutdown('SIGTERM', { exit });
  assert.equal(done, true);
  assert.equal(calls.close, 1);
  assert.equal(calls.end, 1);
  assert.deepEqual(calls.exit, [0]);
  assert.ok(calls.logs.some((l) => /SIGTERM/.test(l)));
});

test('a second signal during shutdown is ignored, not double-closed', async () => {
  const { calls, shutdown, exit } = harness();
  const first = shutdown('SIGTERM', { exit });
  const second = await shutdown('SIGINT', { exit });
  assert.equal(second, false);
  await first;
  assert.equal(calls.close, 1, 'server must only be closed once');
  assert.deepEqual(calls.exit, [0]);
});

test('a hanging connection is cut off at the deadline with exit code 1', async () => {
  const calls = { exit: [] };
  const stuck = { close() { /* never calls back */ } };
  const shutdown = createShutdown({ server: stuck, pool: { end: () => Promise.resolve() }, timeoutMs: 20, log: () => {} });
  shutdown('SIGTERM', { exit: (c) => calls.exit.push(c) });
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(calls.exit, [1], 'deadline must force a non-zero exit');
});

test('a failing pool drain still exits non-zero instead of hanging', async () => {
  const { calls, shutdown, exit } = harness();
  const shutdownWithBadPool = createShutdown({
    server: { close: (cb) => setImmediate(cb) },
    pool: { end: () => Promise.reject(new Error('pool exploded')) },
    timeoutMs: 50,
    log: (m) => calls.logs.push(m),
  });
  await shutdownWithBadPool('SIGTERM', { exit });
  assert.deepEqual(calls.exit, [1]);
  assert.equal(calls.end, 0, 'the good harness pool was untouched');
});

test('missing server or pool is tolerated', async () => {
  const { calls, shutdown } = harness();
  const bare = createShutdown({ timeoutMs: 20, log: () => {} });
  const done = await bare('SIGTERM', { exit: (c) => calls.exit.push(c) });
  assert.equal(done, true);
  assert.deepEqual(calls.exit, [0]);
});

test('shutdown clears the hard deadline on the clean path', async () => {
  const { shutdown } = harness();
  const timers = [];
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => { const t = realSetTimeout(fn, ms); timers.push(t); return t; };
  try {
    await shutdown('SIGTERM', { exit: () => {} });
  } finally {
    global.setTimeout = realSetTimeout;
  }
  assert.equal(timers.length, 1);
  assert.equal(timers[0]._destroyed, true, 'deadline timer should be cleared before exit');
});
