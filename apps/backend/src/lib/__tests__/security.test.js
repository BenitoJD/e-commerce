const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { parseOrigins, securityHeaders } = require('../security');

test('parseOrigins splits, trims and drops blanks', () => {
  assert.deepEqual(parseOrigins('https://a.test, https://b.test '), ['https://a.test', 'https://b.test']);
  assert.deepEqual(parseOrigins(''), []);
  assert.deepEqual(parseOrigins(null), []);
  assert.deepEqual(parseOrigins(' , '), []);
});

test('securityHeaders sets baseline headers, and HSTS only over https', async () => {
  const app = express();
  app.use(securityHeaders);
  app.get('/x', (req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const plain = await fetch(`${base}/x`);
    assert.equal(plain.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(plain.headers.get('x-frame-options'), 'DENY');
    assert.equal(plain.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(plain.headers.get('permissions-policy'), 'geolocation=(), microphone=(), camera=()');
    assert.equal(plain.headers.get('strict-transport-security'), null);

    const proxied = await fetch(`${base}/x`, { headers: { 'x-forwarded-proto': 'https' } });
    assert.match(proxied.headers.get('strict-transport-security'), /max-age=31536000/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
