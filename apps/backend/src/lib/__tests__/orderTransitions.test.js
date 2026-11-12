const test = require('node:test');
const assert = require('node:assert/strict');
const {
  verifySignature,
  amountMatches,
  decideTransition,
  shouldReleaseOnCancel,
  canTransition,
} = require('../orderTransitions');
const crypto = require('crypto');

test('verifySignature accepts a correct HMAC', () => {
  const secret = 'whsec_test123';
  const raw = Buffer.from('{"event":"payment.captured"}');
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(verifySignature(raw, sig, secret), true);
});

test('verifySignature rejects wrong signature', () => {
  const raw = Buffer.from('{"a":1}');
  assert.equal(verifySignature(raw, '0'.repeat(64), 'secret'), false);
});

test('verifySignature rejects non-hex / empty / missing secret', () => {
  const raw = Buffer.from('x');
  assert.equal(verifySignature(raw, 'not-hex!!', 's'), false);
  assert.equal(verifySignature(raw, '', 's'), false);
  assert.equal(verifySignature(raw, 'a'.repeat(64), ''), false);
});

test('verifySignature is case-insensitive on hex', () => {
  const secret = 's';
  const raw = Buffer.from('y');
  const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex').toUpperCase();
  assert.equal(verifySignature(raw, sig, secret), true);
});

test('amountMatches compares numerically', () => {
  assert.equal(amountMatches(549500, 549500), true);
  assert.equal(amountMatches('549500', 549500), true);
  assert.equal(amountMatches(549500, 549400), false);
});

test('capture: pending + matching amount -> paid, no release', () => {
  assert.deepEqual(decideTransition('pending', 'payment.captured', true), {
    to: 'paid', release: false, reason: '',
  });
});

test('capture: failed + matching amount -> paid (retry succeeds)', () => {
  const r = decideTransition('failed', 'payment.captured', true);
  assert.equal(r.to, 'paid');
});

test('capture: paid/shipped/delivered -> ack, no change (out-of-order safe)', () => {
  for (const s of ['paid', 'shipped', 'delivered', 'cancelled', 'refunded']) {
    const r = decideTransition(s, 'payment.captured', true);
    assert.equal(r.to, null, s);
    assert.equal(r.release, false, s);
  }
});

test('capture: amount mismatch -> held for review, no change', () => {
  const r = decideTransition('pending', 'payment.captured', false);
  assert.equal(r.to, null);
  assert.match(r.reason, /mismatch/);
});

test('failed: pending -> failed + release; late failure ignored', () => {
  const r = decideTransition('pending', 'payment.failed', true);
  assert.deepEqual([r.to, r.release], ['failed', true]);
  const late = decideTransition('paid', 'payment.failed', true);
  assert.equal(late.to, null);
});

test('refund: releases only stock-holding statuses', () => {
  assert.deepEqual([decideTransition('paid', 'refund.processed', true).to, decideTransition('paid', 'refund.processed', true).release], ['refunded', true]);
  const shipped = decideTransition('shipped', 'refund.processed', true);
  assert.deepEqual([shipped.to, shipped.release], ['refunded', false]);
  const dup = decideTransition('refunded', 'refund.processed', true);
  assert.equal(dup.to, null);
});

test('unhandled events ack without change', () => {
  const r = decideTransition('pending', 'order.refunded', true);
  assert.equal(r.to, null);
});

test('shouldReleaseOnCancel', () => {
  assert.equal(shouldReleaseOnCancel('pending'), true);
  assert.equal(shouldReleaseOnCancel('paid'), true);
  assert.equal(shouldReleaseOnCancel('cod_pending'), true);
  assert.equal(shouldReleaseOnCancel('shipped'), false);
  assert.equal(shouldReleaseOnCancel('delivered'), false);
  assert.equal(shouldReleaseOnCancel('failed'), false);
  assert.equal(shouldReleaseOnCancel('cancelled'), false);
});

test('canTransition allows the normal fulfillment path', () => {
  for (const [from, to] of [['pending', 'paid'], ['paid', 'shipped'], ['shipped', 'delivered'], ['cod_pending', 'shipped'], ['failed', 'pending']]) {
    assert.equal(canTransition(from, to).ok, true, `${from}->${to}`);
  }
});

test('canTransition blocks nonsense moves', () => {
  for (const [from, to] of [['delivered', 'shipped'], ['cancelled', 'paid'], ['refunded', 'shipped'], ['paid', 'pending'], ['failed', 'delivered']]) {
    const r = canTransition(from, to);
    assert.equal(r.ok, false, `${from}->${to}`);
    assert.match(r.reason, /Cannot move/);
  }
});

test('canTransition allows returns and no-ops, passes unknown through', () => {
  assert.equal(canTransition('delivered', 'refunded').ok, true);
  assert.equal(canTransition('paid', 'paid').ok, true);
  assert.equal(canTransition('custom_state', 'anything').ok, true);
});
