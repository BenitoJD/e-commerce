const test = require('node:test');
const assert = require('node:assert/strict');
const { isEmail, normalizeEmail, orderEmail, smtpConfigured } = require('../notify');

test('email validation is strict enough and normalises case', () => {
  assert.equal(isEmail('Buyer@Example.com '), true);
  assert.equal(normalizeEmail(' Buyer@Example.com '), 'buyer@example.com');
  for (const bad of ['', 'x', 'a@b', 'a b@c.com', '@example.com', null, undefined]) {
    assert.equal(isEmail(bad), false, String(bad));
  }
});

test('order emails carry the receipt, total and tracking link', () => {
  const order = {
    receipt: 'rcpt_test_123',
    amount_paise: 349900,
    pay_mode: 'cod',
    customer: { name: 'Asha' },
    items: [{ slug: 'drill', name: 'Drill', qty: 1, unit_price_paise: 349900 }],
  };
  const placed = orderEmail(order, 'placed');
  assert.match(placed.subject, /rcpt_test_123/);
  assert.match(placed.body, /₹3,499/);
  assert.match(placed.body, /Cash on Delivery/);
  assert.match(placed.body, /track-order\?receipt=rcpt_test_123/);
  assert.match(placed.body, /invoice\/rcpt_test_123/);

  const shipped = orderEmail(order, 'shipped');
  assert.match(shipped.subject, /shipped/i);
  assert.match(shipped.body, /order rcpt_test_123/);
});

test('SMTP is only considered configured with host and sender', () => {
  assert.equal(smtpConfigured({ SMTP_HOST: 'smtp.test', SMTP_FROM: 'a@b.test' }), true);
  assert.equal(smtpConfigured({ SMTP_HOST: 'smtp.test' }), false);
  assert.equal(smtpConfigured({ SMTP_FROM: 'a@b.test' }), false);
  assert.equal(smtpConfigured({}), false);
});
