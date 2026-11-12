const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Two bugs found by reading the image definition, neither reproducible locally:
//  1. next.config.js required ./lib/serverApiBase.cjs, but the runner image only ships
//     .next/public/package.json — `next start` would crash with MODULE_NOT_FOUND.
//  2. BACKEND_INTERNAL_URL was passed as a compose build arg but never declared as ARG in
//     the Dockerfile, so the /sitemap.xml rewrite was baked as http://localhost:9000.
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
const STOREFRONT = path.join(REPO, 'apps', 'storefront');

test('next.config.js is self-contained (runner image has no app sources)', () => {
  const cfg = fs.readFileSync(path.join(STOREFRONT, 'next.config.js'), 'utf8');
  const localRequires = [...cfg.matchAll(/require\(['"]\.\.?\/[^'"]+['"]\)/g)].map((m) => m[1]);
  assert.deepEqual(localRequires, [], `next.config.js must not require app files at boot: ${localRequires.join(', ')}`);
});

test('storefront Dockerfile declares every build arg the config needs', () => {
  const dockerfile = fs.readFileSync(path.join(STOREFRONT, 'Dockerfile'), 'utf8');
  for (const arg of ['NEXT_PUBLIC_BACKEND_URL', 'NEXT_PUBLIC_SITE_URL', 'BACKEND_INTERNAL_URL']) {
    assert.match(dockerfile, new RegExp(`ARG ${arg}`), `Dockerfile should declare ARG ${arg}`);
    assert.match(dockerfile, new RegExp(`ENV ${arg}=\\$${arg}`), `Dockerfile should export ${arg} for the build`);
  }
});

test('storefront runner stage ships what `next start` needs', () => {
  const dockerfile = fs.readFileSync(path.join(STOREFRONT, 'Dockerfile'), 'utf8');
  const runner = dockerfile.split('FROM base AS runner')[1] || '';
  for (const needed of ['.next', 'public', 'package.json', 'next.config.js', 'node_modules']) {
    assert.ok(runner.includes(needed), `runner stage should copy ${needed}`);
  }
});

test('backend image keeps its data + sql folders (seed and migrations live there)', () => {
  const dockerfile = fs.readFileSync(path.join(REPO, 'apps', 'backend', 'Dockerfile'), 'utf8');
  assert.ok(/COPY --chown=node:node \. \./.test(dockerfile), 'backend should copy the app tree');
  const dockerignore = fs.readFileSync(path.join(REPO, 'apps', 'backend', '.dockerignore'), 'utf8');
  for (const keep of ['data', 'sql', 'src']) {
    assert.equal(dockerignore.split(/\r?\n/).includes(keep), false, `.dockerignore must not exclude ${keep}`);
  }
});
