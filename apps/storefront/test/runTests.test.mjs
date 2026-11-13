import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findTestFiles } from '../../../scripts/run-tests.mjs';

// Resolve from this file, not the cwd: the runner may be invoked from the repo root.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-runner-'));
  fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'b.test.mjs'), '// b');
  fs.writeFileSync(path.join(dir, 'a.test.js'), '// a');
  fs.writeFileSync(path.join(dir, 'nested', 'c.test.cjs'), '// c');
  fs.writeFileSync(path.join(dir, 'notes.md'), '# not a test');
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'node_modules', 'ignored.test.js'), '// ignored');
  return dir;
}

test('findTestFiles expands the pattern itself and sorts the result', () => {
  const dir = scratch();
  const files = findTestFiles(dir).map((f) => path.relative(dir, f).replace(/\\/g, '/'));
  assert.deepEqual(files, ['a.test.js', 'b.test.mjs', 'nested/c.test.cjs']);
});

test('findTestFiles ignores node_modules and non-test files', () => {
  const dir = scratch();
  const files = findTestFiles(dir);
  assert.ok(!files.some((f) => f.includes('node_modules')), 'node_modules must be skipped');
  assert.ok(!files.some((f) => f.endsWith('.md')));
});

test('findTestFiles returns an empty list for a directory with no tests', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-runner-empty-'));
  assert.deepEqual(findTestFiles(dir), []);
});

test('both packages run tests through the portable runner, not a --test glob', () => {
  // `node --test "glob"` silently fails on Node 20 (the declared minimum), so the scripts
  // must go through run-tests.mjs.
  for (const pkgPath of ['apps/backend/package.json', 'apps/storefront/package.json']) {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, pkgPath), 'utf8'));
    assert.match(pkg.scripts.test, /run-tests\.mjs/, `${pkgPath} must use the portable runner`);
    assert.doesNotMatch(pkg.scripts.test, /\*\.test\./, `${pkgPath} must not rely on glob expansion`);
  }
});
