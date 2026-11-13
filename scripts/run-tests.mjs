#!/usr/bin/env node
// Portable test runner.
//
// `node --test "src/**/*.test.js"` only expands globs on Node 21+; on Node 20 (the version
// this repo declares and CI uses) the pattern is treated as a literal path and the suite
// fails with "Could not find ... *.test.js". This runner expands the pattern itself, so the
// same command works on every supported Node version.
//
//   node scripts/run-tests.mjs apps/backend/src/lib/__tests__
//   node scripts/run-tests.mjs apps/storefront/test
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUFFIXES = ['.test.js', '.test.mjs', '.test.cjs'];

export function findTestFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (SUFFIXES.some((s) => entry.name.endsWith(s))) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out.sort();
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: node scripts/run-tests.mjs <test-directory>');
    process.exit(2);
  }
  const dir = path.resolve(process.cwd(), target);
  if (!fs.existsSync(dir)) {
    console.error(`[tests] no such directory: ${dir}`);
    process.exit(2);
  }

  const files = findTestFiles(dir);
  if (!files.length) {
    console.error(`[tests] no test files found under ${dir}`);
    process.exit(2);
  }

  const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
  process.exit(res.status == null ? 1 : res.status);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
