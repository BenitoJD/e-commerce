// Finds customer-facing copy that promises something the code cannot do (email/SMS),
// because no mailer or SMS gateway is wired up. Run manually or from CI.
const fs = require('fs');
const path = require('path');

const ROOTS = ['apps/storefront/app', 'apps/storefront/components', 'apps/backend/src'];
const PATTERNS = [
  /will be (?:e-?mailed|mailed|sent by email)/i,
  /email(?:ed)? to you/i,
  /SMS(?:ed)? to you/i,
  /we will (?:call|email|text)/i,
  // Automated-sounding promises that need a mailer/SMS gateway to be true.
  /(?:we'?ll|we will) e-?mail you/i,
  /e-?mail you (?:the moment|as soon as|when)/i,
];

const hits = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (/node_modules|\.next|\.git|__tests__/.test(p)) continue;
    if (entry.isDirectory()) walk(p);
    else if (/\.(js|mjs|cjs)$/.test(entry.name)) {
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        // Only shipped copy matters: skip comments and the audit's own patterns.
        if (/^(\/\/|\*|\/\*)/.test(trimmed)) return;
        if (PATTERNS.some((re) => re.test(trimmed))) hits.push(`${p}:${i + 1}: ${trimmed}`);
      });
    }
  }
}

for (const root of ROOTS) if (fs.existsSync(root)) walk(root);
console.log(hits.length ? hits.join('\n') : 'NO_UNBACKED_PROMISES');
