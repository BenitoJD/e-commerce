const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// CI is the only place the Linux signal path and a clean-machine build run, so a workflow that
// silently stops running the pipeline is worse than no workflow (green badge, no coverage).
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'verify.yml');

test('CI runs the full static pipeline and the live self-audit', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8');
  assert.match(src, /node scripts\/verify-all\.mjs/, 'must run the static pipeline');
  assert.match(src, /node scripts\/self-audit\.mjs/, 'must run the live end-to-end audit');
  assert.match(src, /pnpm install --frozen-lockfile/, 'lockfile must be respected');
  assert.match(src, /node-version: 20/);
  assert.match(src, /NEXT_PUBLIC_SITE_URL: https:\/\/shop\.test/,
    'canonicals must not be built against localhost in CI');
  assert.match(src, /branches: \[main\]/);
});

test('CI does not skip tests to make the badge green', () => {
  const src = fs.readFileSync(WORKFLOW, 'utf8');
  assert.doesNotMatch(src, /continue-on-error:\s*true/, 'failures must fail the build');
  assert.doesNotMatch(src, /--passWithNoTests|SKIP_TESTS|NODE_ENV: test/, 'no bypass flags');
});
