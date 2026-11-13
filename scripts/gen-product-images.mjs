#!/usr/bin/env node
// Generates a branded placeholder SVG for every catalog product into the storefront's
// public/images. Real photography can replace these later without touching code.
//   node scripts/gen-product-images.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'apps/backend/data/products.js');
const outDir = path.join(root, 'apps/storefront/public/images');

// data/products.js is CommonJS; evaluate it in isolation to read the array.
const src = fs.readFileSync(dataPath, 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', 'require', src)(mod, mod.exports, () => ({}));
const products = mod.exports;

const PALETTE = ['#F97316', '#0EA5E9', '#16A34A', '#9333EA', '#DC2626', '#0F766E', '#CA8A04'];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max && line) { lines.push(line.trim()); line = w; }
    else line = `${line} ${w}`;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 3);
}

function svgFor(p, i, variant = 1) {
  const color = PALETTE[(i + variant - 1) % PALETTE.length];
  const initials = (p.brand || p.name || '?').slice(0, 2).toUpperCase();
  const titleLines = wrap(p.name, 26);
  const title = titleLines
    .map((l, n) => `<text x="40" y="${232 + n * 30}" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700" fill="#111827">${esc(l)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400" role="img" aria-label="${esc(p.name)}">
  <rect width="600" height="400" fill="#F3F4F6"/>
  <rect x="0" y="0" width="600" height="150" fill="${color}"/>
  <circle cx="300" cy="150" r="62" fill="#ffffff" opacity="0.95"/>
  <text x="300" y="168" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="40" font-weight="800" fill="${color}">${esc(initials)}</text>
  <text x="40" y="200" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="600" fill="#6B7280">${esc(p.brand || '')}</text>
  ${title}
  <text x="40" y="360" font-family="Segoe UI, Arial, sans-serif" font-size="15" fill="#6B7280">View ${variant} of 3 — placeholder image, replace with real photography</text>
</svg>
`;
}

fs.mkdirSync(outDir, { recursive: true });
let count = 0;
for (const p of products) {
  // Three views per product so the PDP gallery has something real to switch between.
  for (let variant = 1; variant <= 3; variant += 1) {
    const suffix = variant === 1 ? '' : `-${variant}`;
    const file = path.join(outDir, `${p.slug}${suffix}.svg`);
    fs.writeFileSync(file, svgFor(p, count, variant), 'utf8');
  }
  count += 1;
}
console.log(`wrote ${count} placeholder images to apps/storefront/public/images`);
