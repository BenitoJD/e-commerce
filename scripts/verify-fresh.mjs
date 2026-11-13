#!/usr/bin/env node
// Verify the *pushed* repository works from scratch.
//
//   node scripts/verify-fresh.mjs                     # checks out the pushed repository
//   node scripts/verify-fresh.mjs --repo <git-url>    # any repository URL
//   node scripts/verify-fresh.mjs --keep              # leave the temp checkout in place
//
// Why this exists: the local checkout has untracked build output and installed deps, so a
// green local run does not prove that what was pushed is complete. This checks out fresh and runs
// the suites that need only committed files (tests, audits, compose validation), borrowing
// node_modules from the current checkout via NODE_PATH.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const repoArg = args.indexOf('--repo');
const REPO = repoArg !== -1 ? args[repoArg + 1] : 'https://github.com/BenitoJD/e-commerce.git';
const KEEP = args.includes('--keep');

const localRoot = process.cwd();
const depPaths = [
  path.join(localRoot, 'apps', 'backend', 'node_modules'),
  path.join(localRoot, 'node_modules'),
  path.join(localRoot, 'apps', 'storefront', 'node_modules'),
].filter(existsSync);

const workdir = mkdtempSync(path.join(tmpdir(), 'tv-checkout-'));
const checkout = path.join(workdir, 'repo');

function run(label, command, commandArgs, cwd) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const res = spawnSync(command, commandArgs, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, NODE_PATH: depPaths.join(path.delimiter) },
  });
  return { label, ok: res.status === 0 };
}

const results = [];
try {
  console.log(`Checking out ${REPO}\n  into ${checkout}`);
  execFileSync('git', ['clone', '--depth', '1', REPO, checkout], { stdio: 'inherit' });

  const backend = path.join(checkout, 'apps', 'backend');
  const storefront = path.join(checkout, 'apps', 'storefront');

  results.push(run('backend tests (fresh checkout)', process.execPath,
    ['scripts/run-tests.mjs', 'apps/backend/src/lib/__tests__'], checkout));
  results.push(run('storefront tests (fresh checkout)', process.execPath,
    ['scripts/run-tests.mjs', 'apps/storefront/test'], checkout));
  results.push(run('mojibake audit', process.execPath, ['scripts/find-mojibake.cjs'], checkout));
  results.push(run('unbacked-promise audit', process.execPath, ['scripts/find-unbacked-promises.cjs'], checkout));
  results.push(run('compose validation', process.execPath, ['scripts/validate-compose.cjs'], checkout));
} finally {
  if (KEEP) {
    console.log(`\nKept checkout at ${checkout}`);
  } else {
    try { rmSync(workdir, { recursive: true, force: true }); } catch { /* windows file locks */ }
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed on a fresh checkout`);
if (failed.length) {
  console.error('failed:', failed.map((f) => f.label).join(', '));
  process.exit(1);
}
