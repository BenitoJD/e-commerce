const test = require('node:test');
const assert = require('node:assert/strict');
const { makeReadyHandler } = require('../health');

function fakeRes() {
  const out = {};
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { out.body = body; out.status = this.statusCode; return this; },
    get result() { return out; },
  };
}

test('ready: 200 with db up', async () => {
  const handler = makeReadyHandler({ query: async () => ({ rows: [{ ok: 1 }] }) });
  const res = fakeRes();
  await handler({}, res);
  assert.equal(res.result.status, 200);
  assert.deepEqual(res.result.body, { ok: true, db: 'up' });
});

test('ready: 503 with db down, and never throws', async () => {
  const handler = makeReadyHandler({ query: async () => { throw new Error('ECONNREFUSED'); } });
  const res = fakeRes();
  await handler({}, res);
  assert.equal(res.result.status, 503);
  assert.deepEqual(res.result.body, { ok: false, db: 'down' });
});
