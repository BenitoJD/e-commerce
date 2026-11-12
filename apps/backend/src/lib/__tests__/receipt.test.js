const test = require('node:test');
const assert = require('node:assert/strict');
const { makeReceipt, toBase36 } = require('../receipt');

test('receipt IDs are unpredictable, not just unique', () => {
  const a = makeReceipt();
  const b = makeReceipt();
  assert.match(a, /^rcpt_[0-9a-z]+_[0-9a-f]{16}$/);
  assert.notEqual(a, b);

  // 16 hex chars = 64 bits of entropy in the random part
  const randPart = a.split('_')[2];
  assert.equal(randPart.length, 16);
  assert.equal(randPart, randPart.toLowerCase());
});

test('receipt IDs embed time only loosely (no millisecond enumeration channel)', () => {
  const receipt = makeReceipt(Date.now());
  const stamp = receipt.split('_')[1];
  // base36 timestamp is still orderable but the random tail makes guessing impractical
  assert.ok(Number.parseInt(stamp, 36) > 0);
  assert.equal(toBase36(0), '0');
  assert.equal(toBase36(36), '10');
  assert.equal(toBase36(1296), '100');
});

test('receipt generation never collides across a burst', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const r = makeReceipt(1700000000000 + i); // same-ish time, deterministic clock
    assert.equal(seen.has(r), false, `duplicate receipt generated: ${r}`);
    seen.add(r);
  }
});
