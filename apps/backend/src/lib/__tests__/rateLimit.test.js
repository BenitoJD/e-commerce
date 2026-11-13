const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRateLimiter } = require('../rateLimit');

test('index.js meters the typeahead endpoint separately from writes', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'src', 'index.js'), 'utf8');
  assert.match(src, /SUGGEST_RATE_LIMIT_MAX/, 'the typeahead budget must be configurable');
  assert.match(src, /app\.use\('\/store\/search\/suggest', suggestLimit\)/, 'suggest must be rate limited');
  // Reads stay unmetered elsewhere so SEO crawls are not throttled into 429s.
  assert.doesNotMatch(src, /app\.use\('\/store\/products', \w*[Ll]imit\)/, 'product listing must stay unmetered');
});

function fakeReq(ip = '1.2.3.4') {
  return { ip, socket: { remoteAddress: ip } };
}
function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    set(k, v) { this.headers[k] = v; return this; },
    json(b) { this.body = b; return this; },
  };
  return res;
}

test('allows up to the limit, then returns 429 with Retry-After', () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
  for (let i = 0; i < 3; i += 1) {
    const res = fakeRes();
    let nexted = false;
    limiter(fakeReq(), res, () => { nexted = true; });
    assert.equal(nexted, true, `request ${i + 1} should pass`);
  }
  const blocked = fakeRes();
  let nexted = false;
  limiter(fakeReq(), blocked, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.error.includes('Too many'), true);
  assert.ok(Number(blocked.headers['Retry-After']) >= 1);
});

test('keys are per client IP', () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
  const a1 = fakeRes();
  limiter(fakeReq('9.9.9.9'), a1, () => {});
  const a2 = fakeRes();
  let blockedA = false;
  limiter(fakeReq('9.9.9.9'), a2, () => { blockedA = true; });
  assert.equal(blockedA, false);

  const b1 = fakeRes();
  let allowedB = false;
  limiter(fakeReq('8.8.8.8'), b1, () => { allowedB = true; });
  assert.equal(allowedB, true);
});

test('window expiry lets traffic through again', async () => {
  const limiter = createRateLimiter({ windowMs: 30, max: 1 });
  limiter(fakeReq(), fakeRes(), () => {});
  const blocked = fakeRes();
  limiter(fakeReq(), blocked, () => {});
  assert.equal(blocked.statusCode, 429);
  await new Promise((r) => setTimeout(r, 45));
  const after = fakeRes();
  let allowed = false;
  limiter(fakeReq(), after, () => { allowed = true; });
  assert.equal(allowed, true);
});

test('reset clears state', () => {
  const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
  limiter(fakeReq(), fakeRes(), () => {});
  limiter.reset();
  let allowed = false;
  limiter(fakeReq(), fakeRes(), () => { allowed = true; });
  assert.equal(allowed, true);
});

test('wires into express: path arrays rate-limit, GET stays open', async () => {
  const express = require('express');
  const limiter = createRateLimiter({ windowMs: 60000, max: 2 });
  const app = express();
  app.use(['/write', '/other-write'], limiter);
  app.use('/mixed', (req, res, next) => (req.method === 'GET' ? next() : limiter(req, res, next)));
  app.get('/mixed', (req, res) => res.json({ ok: true }));
  app.post('/mixed', (req, res) => res.json({ ok: true }));
  app.post('/write', (req, res) => res.json({ ok: true }));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const post = () => fetch(`${base}/write`, { method: 'POST' });
    assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 200);
    const third = await post();
    assert.equal(third.status, 429);
    assert.ok(Number(third.headers.get('retry-after')) >= 1);

    // GETs on the mixed path are never metered
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await fetch(`${base}/mixed`)).status, 200);
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
});
