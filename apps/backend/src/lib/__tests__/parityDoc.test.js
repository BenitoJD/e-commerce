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

test('PARITY.md states the current verification wave and the overall status', () => {
  // The header drifted for 17 waves because an automated edit silently matched nothing while
  // still reporting success. A stale header makes the doc look unmaintained.
  const head = fs.readFileSync(DOC, 'utf8').split(/\r?\n/).slice(0, 10).join('\n');
  const wave = head.match(/Last verified: wave (\d+)/);
  assert.ok(wave, 'header must state the wave it was verified at');
  assert.ok(Number(wave[1]) >= 200, `header wave ${wave[1]} looks stale`);
  assert.match(head, /\*\*Status:/, 'header must state whether parity is complete');
  assert.match(head, /(complete|remaining)/i);
});

test('the documented test counts agree with each other', () => {
  // The header said 297 while the Tests section still said 245, two places, one truth.
  const src = fs.readFileSync(DOC, 'utf8');
  const header = src.match(/backend \*\*(\d+)\*\* tests, storefront \*\*(\d+)\*\* tests/);
  const section = src.match(/npm test`, (\d+) tests/);
  const sectionFront = src.match(/Storefront:[\s\S]*?npm test`, (\d+) tests/);
  assert.ok(header, 'header must state backend/storefront counts');
  assert.ok(section, 'Tests section must state the backend count');
  assert.ok(sectionFront, 'Tests section must state the storefront count');
  assert.equal(header[1], section[1], 'backend counts disagree between header and Tests section');
  assert.equal(header[2], sectionFront[1], 'storefront counts disagree between header and Tests section');
});

test('no section still carries an open-work marker', () => {
  // 🚧 means "still to do"; the user should never find one left behind without an explanation.
  const src = fs.readFileSync(DOC, 'utf8');
  assert.doesNotMatch(src, /🚧/, 'remove the marker or explain the remaining work');
});

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
