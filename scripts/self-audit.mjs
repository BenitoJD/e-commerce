// One-command end-to-end self audit.
//
// Boots the fixture backend (real catalogue data), starts the built storefront against it,
// then runs smoke.mjs (routes + rendered-artefact scan) and audit-pages.mjs (canonical, title,
// H1, JSON-LD, img alt). Both processes are always cleaned up, and the exit code reflects the
// worst result — so "it passed" is reproducible instead of a manual ritual.
//
//   node scripts/verify-all.mjs        # build first (this script needs .next)
//   node scripts/self-audit.mjs
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const STOREFRONT = path.join(ROOT, 'apps', 'storefront');

const FIXTURE_PORT = Number(process.env.FIXTURE_PORT) || 9100;
const APP_PORT = Number(process.env.APP_PORT) || 3130;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://shop.test';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'fixture-admin-token';

// /sitemap.xml is rewritten to BACKEND_INTERNAL_URL at BUILD time and baked into the build,
// so the fixture has to listen where the build expects it — otherwise the proxy 500s.
function bakedBackendPort() {
  try {
    const manifest = JSON.parse(readFileSync(path.join(STOREFRONT, '.next', 'routes-manifest.json'), 'utf8'));
    const entry = (manifest.rewrites?.beforeFiles || manifest.rewrites || [])
      .find?.((r) => String(r.source).includes('sitemap')) || (manifest.rewrites?.beforeFiles || [])[0];
    const destination = entry && entry.destination;
    const port = destination ? new URL(destination).port : '';
    return port ? Number(port) : null;
  } catch {
    return null;
  }
}

const children = [];
function track(child) {
  children.push(child);
  return child;
}

function cleanup() {
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    }
  }
}

async function waitFor(url, { attempts = 60, delayMs = 500 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

function runScript(label, file, args, env) {
  return new Promise((resolve) => {
    console.log(`\n=== ${label} ===`);
    const child = track(spawn(process.execPath, [path.join(ROOT, 'scripts', file), ...args], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    }));
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

async function main() {
  if (!existsSync(path.join(STOREFRONT, '.next', 'BUILD_ID'))) {
    console.error('[self-audit] apps/storefront/.next/BUILD_ID missing — run `node scripts/verify-all.mjs` first.');
    process.exit(2);
  }

  const bakedPort = bakedBackendPort();
  const fixturePort = Number(process.env.FIXTURE_PORT) || bakedPort || FIXTURE_PORT;

  console.log(`[self-audit] fixture backend :${fixturePort}${bakedPort ? ' (matches baked sitemap rewrite)' : ''}, storefront :${APP_PORT}`);
  const fixture = track(spawn(process.execPath, [path.join(ROOT, 'scripts', 'fixture-backend.mjs')], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, FIXTURE_PORT: String(fixturePort), ADMIN_TOKEN, NEXT_PUBLIC_SITE_URL: SITE_URL },
  }));

  if (!(await waitFor(`http://127.0.0.1:${fixturePort}/health`))) {
    console.error('[self-audit] fixture backend did not start');
    cleanup();
    process.exit(1);
  }

  const app = track(spawn(process.execPath, [path.join(STOREFRONT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start'], {
    cwd: STOREFRONT,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      NODE_ENV: 'production',
      BACKEND_INTERNAL_URL: `http://127.0.0.1:${fixturePort}`,
      NEXT_PUBLIC_SITE_URL: SITE_URL,
      ADMIN_TOKEN,
    },
  }));

  if (!(await waitFor(`http://127.0.0.1:${APP_PORT}/`, { attempts: 120 }))) {
    console.error('[self-audit] storefront did not start');
    cleanup();
    process.exit(1);
  }

  const productsMod = require(path.join(ROOT, 'apps', 'backend', 'data', 'products.js'));
  const first = (Array.isArray(productsMod) ? productsMod : productsMod.products)[0];

  const base = `http://127.0.0.1:${APP_PORT}`;
  const smokeOk = await runScript('smoke (routes + rendered artefacts)', 'smoke.mjs', [], {
    BASE_URL: base,
    PRODUCT_SLUG: first.slug,
    BRAND: first.brand,
  });
  const auditOk = await runScript('page audit (SEO + metadata)', 'audit-pages.mjs', [base, first.slug, first.category, first.brand], {});
  // Every advertised URL, not just the hand-listed ones.
  const crawlOk = await runScript('sitemap crawl (every advertised URL)', 'crawl-sitemap.mjs', [base], {});

  cleanup();
  const passed = [smokeOk, auditOk, crawlOk].filter(Boolean).length;
  console.log(`\n=== self-audit: ${passed}/3 suites passed ===`);
  process.exit(passed === 3 ? 0 : 1);
}

process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('uncaughtException', (err) => {
  console.error('[self-audit] crash:', err && err.message);
  cleanup();
  process.exit(1);
});

main();
