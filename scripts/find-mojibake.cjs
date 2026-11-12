// Finds mojibake in source files. Detects the characteristic sequences produced when
// UTF-8 bytes are decoded as Windows-1252 (and sometimes re-encoded again).
const fs = require('fs');
const path = require('path');

const ROOTS = [
  'apps/storefront/app',
  'apps/storefront/components',
  'apps/storefront/lib',
  'apps/storefront/test',
  'apps/backend/src',
  'apps/backend/data',
  'packages',
];

// Characters that only appear via double-decoding of UTF-8 punctuation/currency.
const MARKERS = ['\u00e2\u20ac\u201d', '\u00e2\u20ac\u201c', '\u00e2\u201a\u00b9', '\u00e2\u00a4', '\u00c2\u00b7', '\u00c3\u00a9', '\u00c3\u00a8'];

const hits = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (/node_modules|\.next|[\\/]\.git/.test(p)) continue;
    if (entry.isDirectory()) walk(p);
    else if (/\.(js|mjs|cjs|jsx|json|md)$/.test(entry.name)) {
      const text = fs.readFileSync(p, 'utf8');
      const found = MARKERS.filter((m) => text.includes(m));
      if (found.length || text.includes('\uFFFD')) hits.push(`${p} -> ${found.length ? found.map((f) => JSON.stringify(f)).join(', ') : 'U+FFFD'}`);
    }
  }
}

for (const root of ROOTS) if (fs.existsSync(root)) walk(root);
console.log(hits.length ? hits.join('\n') : 'NO_MOJIBAKE_IN_SOURCE');
console.log(`files scanned under: ${ROOTS.length} roots`);
