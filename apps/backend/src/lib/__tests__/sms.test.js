const test = require('node:test');
const assert = require('node:assert/strict');
const { smsConfigured, sendSms, normalizeTo } = require('../sms');

const ENV = {
  SMS_PROVIDER: 'twilio',
  TWILIO_ACCOUNT_SID: 'AC123',
  TWILIO_AUTH_TOKEN: 'secret',
  TWILIO_FROM: '+15550001111',
};

test('SMS requires a supported provider plus all credentials', () => {
  assert.equal(smsConfigured(ENV), true);
  assert.equal(smsConfigured({ ...ENV, SMS_PROVIDER: 'msg91' }), false);
  assert.equal(smsConfigured({ ...ENV, TWILIO_AUTH_TOKEN: '' }), false);
  assert.equal(smsConfigured({}), false);
});

test('Indian phone numbers normalise to E.164', () => {
  assert.equal(normalizeTo('9876543210'), '+919876543210');
  assert.equal(normalizeTo('919876543210'), '+919876543210');
  assert.equal(normalizeTo('+91 98765 43210'), '+919876543210');
  assert.equal(normalizeTo(''), '');
});

test('sendSms posts to Twilio and reports success', async () => {
  let captured = null;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, json: async () => ({ sid: 'SM123' }) };
  };
  const res = await sendSms('9876543210', 'Your code is 123456', { env: ENV, fetchImpl: fakeFetch });
  assert.equal(res.sent, true);
  assert.equal(res.id, 'SM123');
  assert.match(captured.url, /Accounts\/AC123\/Messages\.json/);
  assert.match(captured.opts.headers.Authorization, /^Basic /);
  assert.match(captured.opts.body, /To=%2B919876543210/);
});

test('sendSms fails closed on gateway and network errors', async () => {
  const bad = async () => ({ ok: false, status: 401, text: async () => 'nope' });
  const r1 = await sendSms('9876543210', 'x', { env: ENV, fetchImpl: bad });
  assert.equal(r1.sent, false);
  assert.match(r1.reason, /401/);

  const boom = async () => { throw new Error('network down'); };
  const r2 = await sendSms('9876543210', 'x', { env: ENV, fetchImpl: boom });
  assert.equal(r2.sent, false);
  assert.match(r2.reason, /network down/);

  const unconfigured = await sendSms('9876543210', 'x', { env: {}, fetchImpl: async () => { throw new Error('should not be called'); } });
  assert.equal(unconfigured.sent, false);
});
