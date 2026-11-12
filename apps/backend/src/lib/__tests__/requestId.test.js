const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { requestId, makeRequestId } = require('../requestId');

test('makeRequestId is 16 hex chars and unique', () => {
  const a = makeRequestId();
  const b = makeRequestId();
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.notEqual(a, b);
});

test('requestId sets a header, honours a sane incoming id, and rejects junk', async () => {
  const app = express();
  app.use(requestId);
  app.get('/x', (req, res) => res.json({ id: req.id }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const plain = await fetch(`${base}/x`);
    const header = plain.headers.get('x-request-id');
    assert.match(header, /^[0-9a-f]{16}$/);
    assert.equal((await plain.json()).id, header);

    const forwarded = await fetch(`${base}/x`, { headers: { 'x-request-id': 'trace-abc-123' } });
    assert.equal(forwarded.headers.get('x-request-id'), 'trace-abc-123');
    assert.equal((await forwarded.json()).id, 'trace-abc-123');

    // junk / header injection attempts are replaced, never echoed
    const junk = await fetch(`${base}/x`, { headers: { 'x-request-id': 'bad id with spaces' } });
    assert.notEqual(junk.headers.get('x-request-id'), 'bad id with spaces');
    assert.match(junk.headers.get('x-request-id'), /^[0-9a-f]{16}$/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
