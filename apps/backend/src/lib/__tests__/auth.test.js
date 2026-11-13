const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPassword, verifyPassword, randomToken, hashToken, generateOtp, hashOtp, otpMatches,
  issueOrderToken, verifyOrderToken,
} = require('../auth');

test('passwords are salted, hashed and verified', () => {
  const a = hashPassword('Secret12345');
  const b = hashPassword('Secret12345');
  assert.notEqual(a, b, 'each hash must use a fresh salt');
  assert.match(a, /^scrypt\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.equal(verifyPassword('Secret12345', a), true);
  assert.equal(verifyPassword('wrong-password', a), false);
  assert.equal(verifyPassword('Secret12345', 'garbage'), false);
  assert.equal(verifyPassword('Secret12345', null), false);
});

test('session tokens are random and only the hash is stored', () => {
  const token = randomToken(32);
  assert.ok(token.length >= 40);
  assert.notEqual(token, randomToken(32));
  assert.match(hashToken(token), /^[0-9a-f]{64}$/);
  assert.notEqual(hashToken(token), token);
});

test('OTP codes are six digits and verify only for the right phone/code', () => {
  process.env.AUTH_SECRET = 'test-auth-secret';
  const code = generateOtp();
  assert.match(code, /^\d{6}$/);
  const hash = hashOtp('9876543210', code);
  assert.equal(otpMatches('9876543210', code, hash), true);
  assert.equal(otpMatches('9876543210', '000000', hash), false);
  assert.equal(otpMatches('9000000000', code, hash), false, 'code is bound to the phone');
});

test('order access tokens are signed, expire and reject tampering', () => {
  process.env.AUTH_SECRET = 'test-auth-secret';
  const token = issueOrderToken('9876543210', { minutes: 5 });
  const payload = verifyOrderToken(token);
  assert.equal(payload.phone, '9876543210');
  assert.ok(payload.expiresAt > Date.now());

  assert.equal(verifyOrderToken(token.slice(0, -2) + 'xx'), null, 'signature is checked');
  assert.equal(verifyOrderToken('not-a-token'), null);
  assert.equal(verifyOrderToken(''), null);

  const expired = issueOrderToken('9876543210', { minutes: -1 });
  assert.equal(verifyOrderToken(expired), null, 'expired token is rejected');
});

test('different secrets cannot validate each other\'s order tokens', () => {
  process.env.AUTH_SECRET = 'secret-one';
  const token = issueOrderToken('9876543210');
  process.env.AUTH_SECRET = 'secret-two';
  assert.equal(verifyOrderToken(token), null);
});
