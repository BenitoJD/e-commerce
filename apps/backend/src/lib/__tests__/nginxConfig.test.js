const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The reverse proxy is the only piece that runs on every request in production and has no
// executable test here (no Docker), so its routing and caching rules are asserted
// structurally. A broken `location` block serves the wrong app or drops the webhook.
const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const NGINX = path.join(ROOT, 'infra', 'nginx.conf');

function conf() {
  return fs.readFileSync(NGINX, 'utf8');
}

test('the sitemap/robots routes exist before the catch-all', () => {
  const src = conf();
  const catchAll = src.lastIndexOf('location / {');
  assert.ok(catchAll > -1, 'catch-all location missing');
  for (const block of ['location = /sitemap.xml', 'location = /robots.txt', 'location /images/', 'location /_next/static/']) {
    const at = src.indexOf(block);
    assert.ok(at > -1, `${block} missing`);
    assert.ok(at < catchAll, `${block} must be declared before the catch-all`);
  }
});

test('the razorpay webhook bypasses buffering and reaches the backend path', () => {
  const src = conf();
  const block = src.slice(src.indexOf('location = /api/webhooks/razorpay'), src.indexOf('location /api/ {'));
  assert.match(block, /proxy_pass http:\/\/backend_up\/webhooks\/razorpay;/);
  assert.match(block, /proxy_buffering off;/, 'webhook must not be buffered');
});

test('static assets and catalogue images carry cache headers', () => {
  const src = conf();
  assert.match(src, /location \/_next\/static\/[\s\S]*?max-age=31536000, immutable/, 'build assets should be immutable');
  assert.match(src, /location \/images\/[\s\S]*?Cache-Control "public, max-age=604800"/, 'images should cache for a week');
});

test('compression is enabled for text but not for images', () => {
  const src = conf();
  assert.match(src, /gzip on;/);
  assert.match(src, /gzip_proxied any;/, 'proxied responses are the normal case here');
  const types = (src.match(/gzip_types([^;]+);/) || [])[1] || '';
  assert.match(types, /application\/json/);
  assert.match(types, /text\/css/);
  assert.doesNotMatch(types, /image\/(png|jpeg|webp|gif)/, 'binary images must not be re-compressed');
});

test('readiness is reachable directly for uptime monitors', () => {
  const src = conf();
  assert.match(src, /location = \/ready[\s\S]*?proxy_pass http:\/\/backend_up\/ready;/);
});
