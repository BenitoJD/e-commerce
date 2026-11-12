const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Keyboard/screen-reader basics that are easy to lose in a refactor.
const APP = path.resolve(__dirname, '..', '..', '..', '..', '..', 'apps', 'storefront', 'app');

test('root layout has a skip link and a focusable main landmark', () => {
  const src = fs.readFileSync(path.join(APP, 'layout.js'), 'utf8');
  assert.match(src, /href="#main-content"/, 'missing skip link');
  assert.match(src, /Skip to main content/);
  assert.match(src, /<main[^>]*id="main-content"/, 'main landmark needs the skip target id');
  assert.match(src, /<main[^>]*tabIndex=\{-1\}/, 'main must be focusable so the skip link works');
  assert.match(src, /<html lang="en">/, 'page language must be declared');
});

test('navigation landmarks are labelled when more than one exists', () => {
  const src = fs.readFileSync(path.join(APP, 'layout.js'), 'utf8');
  const navs = src.match(/<nav\b[^>]*>/g) || [];
  assert.ok(navs.length >= 1, 'expected at least one nav landmark');
  for (const nav of navs) {
    assert.match(nav, /aria-label=/, `nav without an accessible name: ${nav}`);
  }
});
