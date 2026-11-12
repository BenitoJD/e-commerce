const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Placeholder text is not an accessible name (WCAG 3.3.2). Every <input> in the storefront
// must carry aria-label/aria-labelledby (or be a hidden/radio/checkbox control that is
// labelled by its wrapper). This guards against new unlabelled inputs creeping in.
const STOREFRONT = path.resolve(__dirname, '..', '..', '..', '..', '..', 'apps', 'storefront');
const ROOTS = [path.join(STOREFRONT, 'app'), path.join(STOREFRONT, 'components')];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!/node_modules|\.next/.test(p)) walk(p, out);
    } else if (/\.js$/.test(entry.name)) out.push(p);
  }
  return out;
}

function tagAt(src, start) {
  let brace = 0;
  let quote = null;
  for (let j = start; j < src.length; j += 1) {
    const ch = src[j];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') { brace += 1; continue; }
    if (ch === '}') { brace -= 1; continue; }
    if (ch === '>' && brace === 0) return src.slice(start, j + 1);
  }
  return src.slice(start);
}

test('every storefront input has an accessible name', () => {
  const offenders = [];
  for (const file of ROOTS.flatMap((r) => walk(r, []))) {
    const rel = path.relative(STOREFRONT, file).replace(/\\/g, '/');
    const src = fs.readFileSync(file, 'utf8');
    let from = 0;
    for (;;) {
      const start = src.indexOf('<input', from);
      if (start === -1) break;
      const tag = tagAt(src, start);
      from = start + tag.length;
      if (/type="hidden"|type="radio"|type="checkbox"/.test(tag)) continue;
      if (!/aria-label=|aria-labelledby=/.test(tag)) {
        const line = src.slice(0, start).split(/\r?\n/).length;
        offenders.push(`${rel}:${line}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `inputs without an accessible name:\n${offenders.join('\n')}`);
});
