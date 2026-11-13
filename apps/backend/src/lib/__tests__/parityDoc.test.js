const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// PARITY.md is the contract the user reads to see what is done vs. what needs their input.
// Two failure modes have bitten it: duplicated headings, and completed (✅) rows drifting
// into the "Needs your inputs" table where they look like blockers.
const DOC = path.resolve(__dirname, '..', '..', '..', '..', '..', 'docs', 'PARITY.md');

function sections() {
  const lines = fs.readFileSync(DOC, 'utf8').split(/\r?\n/);
  const out = [];
  let current = null;
  for (const line of lines) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      current = { title: h[1].trim(), lines: [] };
      out.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return out;
}

test('PARITY.md has no duplicate section headings', () => {
  const titles = sections().map((s) => s.title);
  const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
  assert.deepEqual(dupes, [], `duplicate headings: ${dupes.join(', ')}`);
});

test('"Needs your inputs" lists only things the user must supply, never ✅ items', () => {
  const needs = sections().find((s) => /needs your inputs/i.test(s.title));
  assert.ok(needs, 'the "Needs your inputs" section must exist');
  const done = needs.lines.filter((l) => l.trim().startsWith('|') && l.includes('✅'));
  assert.deepEqual(done, [], `completed items misfiled as blockers:\n${done.join('\n')}`);
});

test('PARITY.md documents the storefront and hardening status', () => {
  const titles = sections().map((s) => s.title.toLowerCase());
  assert.ok(titles.some((t) => t.includes('storefront')), 'missing Storefront section');
  assert.ok(titles.some((t) => t.includes('hardening')), 'missing Hardening section');
  assert.ok(titles.some((t) => t.includes('tests')), 'missing Tests section');
});
