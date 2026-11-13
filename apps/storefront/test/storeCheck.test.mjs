import test from 'node:test';
import assert from 'node:assert/strict';
import { storeWarnings, looksLikePlaceholder, gstinLooksValid } from '../lib/storeCheck.js';

const REAL = {
  name: 'Acme Tools',
  phone: '919876543210',
  email: 'care@acmetools.in',
  address: '12 Industrial Estate, Pune 411001',
  gstin: '27AAPFU0939F1ZV',
};

test('a real identity produces no warnings in production', () => {
  assert.deepEqual(storeWarnings(REAL, { NODE_ENV: 'production' }), []);
});

test('development never warns', () => {
  assert.deepEqual(storeWarnings(REAL, { NODE_ENV: 'development' }), []);
  assert.deepEqual(storeWarnings({ phone: '', email: '', gstin: '' }, {}), []);
});

test('placeholder phone, email and GSTIN are each called out', () => {
  const warnings = storeWarnings({
    ...REAL, phone: '919999999999', email: 'care@example.com', gstin: '27AAAAA0000A1Z5',
  }, { NODE_ENV: 'production' });
  assert.ok(warnings.some((w) => /phone is a placeholder/.test(w)));
  assert.ok(warnings.some((w) => /email is a placeholder/.test(w)));
  assert.ok(warnings.some((w) => /GSTIN is missing or invalid/.test(w)));
});

test('an empty address and localhost site URL are reported', () => {
  const warnings = storeWarnings({ ...REAL, address: '  ' }, { NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' });
  assert.ok(warnings.some((w) => /address is empty/.test(w)));
  assert.ok(warnings.some((w) => /NEXT_PUBLIC_SITE_URL points at localhost/.test(w)));
});

test('placeholder detection tolerates formatting and rejects real values', () => {
  assert.equal(looksLikePlaceholder('+91 99999 99999'), true);
  assert.equal(looksLikePlaceholder('919999999999'), true);
  assert.equal(looksLikePlaceholder('placeholder@shop.test'), true);
  assert.equal(looksLikePlaceholder('care@ecommerce.in'), true, 'the shipped demo identity is a placeholder too');
  assert.equal(looksLikePlaceholder(''), true);
  assert.equal(looksLikePlaceholder('919876543210'), false);
  assert.equal(looksLikePlaceholder('care@acmetools.in'), false);
});

test('GSTIN check enforces the checksum, not just the shape', () => {
  assert.equal(gstinLooksValid('27AAPFU0939F1ZV'), true);
  assert.equal(gstinLooksValid('27AAPFU0939F1ZX'), false, 'wrong check character');
  assert.equal(gstinLooksValid('27AAAAA0000A1Z5'), false);
  assert.equal(gstinLooksValid(''), false);
});
