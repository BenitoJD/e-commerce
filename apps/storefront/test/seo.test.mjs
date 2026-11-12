import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl } from '../lib/seo.js';

test('canonicalUrl joins a real origin and path', () => {
  assert.equal(canonicalUrl('/contact-us', 'https://shop.test'), 'https://shop.test/contact-us');
  assert.equal(canonicalUrl('/contact-us', 'https://shop.test/'), 'https://shop.test/contact-us');
  assert.equal(canonicalUrl('contact-us', 'https://shop.test'), 'https://shop.test/contact-us');
  assert.equal(canonicalUrl('/bulk-quote', 'https://www.shop.test/app'), 'https://www.shop.test/app/bulk-quote');
});

test('canonicalUrl refuses localhost and relative bases', () => {
  for (const base of [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://[::1]:3000',
    'localhost:3000',
    '/api',
    '',
    null,
  ]) {
    assert.equal(canonicalUrl('/x', base), undefined, `expected no canonical for ${String(base)}`);
  }
  // `undefined` means "fall back to NEXT_PUBLIC_SITE_URL", so verify that path explicitly.
  const saved = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    assert.equal(canonicalUrl('/x', undefined), undefined);
    process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.test';
    assert.equal(canonicalUrl('/x', undefined), 'https://shop.test/x');
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = saved;
  }
});

test('canonicalUrl keeps plain http origins (staging domains are real)', () => {
  assert.equal(canonicalUrl('/x', 'http://staging.shop.test'), 'http://staging.shop.test/x');
});
