#!/usr/bin/env node
// Verify the *pushed* repository works from scratch.
//
//   node scripts/verify-clone.mjs                     # clones BenitoJD/toolsvilla-clone
//   node scripts/verify-clone.mjs --repo <git-url>    # any clone URL
//   node scripts/verify-clone.mjs --keep              # leave the temp clone in place
//
// Why this exists: the local checkout has untracked build output and installed deps, so a
// green local run does not prove that what was pushed is complete. This clones fresh and runs
// the suites that need only committed files (tests, audits, compose validation), borrowing
// node_modules from the current checkout via NODE_PATH.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const repoArg = args.indexOf('--repo');
const REPO = repoArg !== -1 ? args[repoArg + 1] : 'https://github.com/BenitoJD/toolsvilla-clone.git';
const KEEP = args.includes('--keep');

const localRoot = process.cwd();
const depPaths = [
  path.join(localRoot, 'apps', 'backend', 'node_modules'),
  path.join(localRoot, 'node_modules'),
  path.join(localRoot, 'apps', 'storefront', 'node_modules'),
].filter(existsSync);

const workdir = mkdtempSync(path.join(tmpdir(), 'tv-clone-'));
const clone = path.join(workdir, 'repo');

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
  console.log(`Cloning ${REPO}\n  into ${clone}`);
  execFileSync('git', ['clone', '--depth', '1', REPO, clone], { stdio: 'inherit' });

  const backend = path.join(clone, 'apps', 'backend');
  const storefront = path.join(clone, 'apps', 'storefront');

  results.push(run('backend tests (fresh clone)', process.execPath,
    ['--test', 'src/lib/__tests__/*.test.js'], backend));
  results.push(run('storefront tests (fresh clone)', process.execPath,
    ['--test', 'test/*.test.mjs'], storefront));
  results.push(run('mojibake audit', process.execPath, ['scripts/find-mojibake.cjs'], clone));
  results.push(run('unbacked-promise audit', process.execPath, ['scripts/find-unbacked-promises.cjs'], clone));
  results.push(run('compose validation', process.execPath, ['scripts/validate-compose.cjs'], clone));
} finally {
  if (KEEP) {
    console.log(`\nKept clone at ${clone}`);
  } else {
    try { rmSync(workdir, { recursive: true, force: true }); } catch { /* windows file locks */ }
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed on a fresh clone`);
if (failed.length) {
  console.error('failed:', failed.map((f) => f.label).join(', '));
  process.exit(1);
}
