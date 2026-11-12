const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// No mailer or SMS gateway is wired up (see docs/PARITY.md "needs your inputs"), so any
// copy promising an email/SMS is a promise the store cannot keep. This caught
// "A GST invoice will be emailed to you" on the order-success page.
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
const ROOTS = ['apps/storefront/app', 'apps/storefront/components'];

const PATTERNS = [
  /will be (?:e-?mailed|mailed)/i,
  /(?:e-?mail|sms|text)(?:ed)? (?:to you|will be sent)/i,
  /invoice will be (?:e-?mailed|sent)/i,
  // Automated-sounding promises the store cannot keep without a mailer.
  /(?:we'?ll|we will) e-?mail you/i,
  /e-?mail you (?:the moment|as soon as|when)/i,
  /the moment it'?s (?:back|available)/i,
];

function collectFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (/node_modules|\.next/.test(p)) continue;
    if (entry.isDirectory()) collectFiles(p, out);
    else if (/\.(js|mjs|cjs)$/.test(entry.name)) out.push(p);
  }
}

test('storefront copy does not promise email/SMS the store cannot send', () => {
  const files = [];
  ROOTS.forEach((r) => collectFiles(path.join(REPO, r), files));
  assert.ok(files.length > 10, 'expected to scan storefront sources');

  const offenders = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (PATTERNS.some((re) => re.test(line))) {
        offenders.push(`${path.relative(REPO, file)}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `unbacked promises found:\n${offenders.join('\n')}`);
});
