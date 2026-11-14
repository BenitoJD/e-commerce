#!/usr/bin/env node
// One-command project verification.
//
//   node scripts/verify-all.mjs
//
// Runs every check that can be executed without Docker/Postgres: both test suites, the
// compose structural validator, the storefront production build, and the repo audits
// (mojibake + unbacked promises). Exits non-zero if anything fails, so it can gate a
// push or a deploy. The live route smoke test needs running servers and is separate:
//   BASE_URL=http://localhost:3000 node scripts/smoke.mjs
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;

const CHECKS = [
  {
    name: 'backend tests',
    // run-tests.mjs expands the file list itself: `node --test "glob"` only works on Node 21+,
    // which broke the suite on Node 20 (the version this repo declares and CI uses).
    cmd: NODE,
    args: ['../../scripts/run-tests.mjs', 'src/lib/__tests__'],
    cwd: path.join(ROOT, 'apps/backend'),
  },
  {
    name: 'storefront tests',
    cmd: NODE,
    args: ['../../scripts/run-tests.mjs', 'test'],
    cwd: path.join(ROOT, 'apps/storefront'),
  },
  {
    name: 'compose validation',
    cmd: NODE,
    args: ['scripts/validate-compose.cjs'],
    cwd: ROOT,
  },
  {
    name: 'storefront build',
    cmd: NODE,
    args: ['./node_modules/next/dist/bin/next', 'build'],
    cwd: path.join(ROOT, 'apps/storefront'),
    // Build must not need a live API: SSR falls back gracefully.
    env: { NEXT_PUBLIC_BACKEND_URL: '/api', BACKEND_INTERNAL_URL: 'http://127.0.0.1:9000' },
  },
  {
    name: 'mojibake audit',
    cmd: NODE,
    args: ['scripts/find-mojibake.cjs'],
    cwd: ROOT,
    expectClean: 'NO_MOJIBAKE_IN_SOURCE',
  },
  {
    name: 'unbacked-promise audit',
    cmd: NODE,
    args: ['scripts/find-unbacked-promises.cjs'],
    cwd: ROOT,
    expectClean: 'NO_UNBACKED_PROMISES',
  },
];

const results = [];

for (const check of CHECKS) {
  const started = Date.now();
  const res = spawnSync(check.cmd, check.args, {
    cwd: check.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...(check.env || {}) },
    maxBuffer: 32 * 1024 * 1024,
  });
  const ms = Date.now() - started;
  const output = `${res.stdout || ''}${res.stderr || ''}`;

  let ok = res.status === 0;
  let detail = '';
  if (ok && check.expectClean && !output.includes(check.expectClean)) {
    ok = false;
    detail = `expected marker "${check.expectClean}"`;
  }

  // Node's reporter differs by version: "ℹ tests 5" on 22+, "# tests 5" on 20. Show counts
  // either way so CI output stays informative.
  const tests = output.match(/(?:ℹ|#) tests (\d+)/);
  const pass = output.match(/(?:ℹ|#) pass (\d+)/);
  const fail = output.match(/(?:ℹ|#) fail (\d+)/);
  if (tests) detail = `${pass ? pass[1] : '?'}/${tests[1]} passed`;

  results.push({ name: check.name, ok, ms, detail });
  const status = ok ? 'ok  ' : 'FAIL';
  console.log(`${status} ${String(ms).padStart(7)}ms  ${check.name}${detail ? `, ${detail}` : ''}`);
  if (!ok) {
    const tail = output.trim().split(/\r?\n/).slice(-25).join('\n');
    console.log(`--- ${check.name} output (tail) ---\n${tail}\n---`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(`failed: ${failed.map((f) => f.name).join(', ')}`);
  process.exit(1);
}
