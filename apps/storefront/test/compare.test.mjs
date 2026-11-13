import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pushCompare, removeCompare, toggleCompare, parseCompare, specRows, COMPARE_MAX,
} from '../lib/compare.js';

const item = (slug, extra = {}) => ({ slug, name: slug.toUpperCase(), price: 100, ...extra });

test('pushCompare adds in order and de-duplicates', () => {
  let list = [];
  list = pushCompare(list, item('a'));
  list = pushCompare(list, item('b'));
  assert.deepEqual(list.map((x) => x.slug), ['a', 'b']);

  list = pushCompare(list, item('a', { price: 250 }));
  assert.deepEqual(list.map((x) => x.slug), ['a', 'b'], 're-adding moves nothing and does not duplicate');
  assert.equal(list.find((x) => x.slug === 'a').price, 100, 'existing entry is kept as-is');
});

test('pushCompare refuses to exceed the cap instead of evicting a choice', () => {
  let list = [];
  for (const slug of ['a', 'b', 'c', 'd']) list = pushCompare(list, item(slug));
  assert.equal(list.length, COMPARE_MAX);

  const after = pushCompare(list, item('e'));
  assert.equal(after.length, COMPARE_MAX, 'cap holds');
  assert.deepEqual(after.map((x) => x.slug), ['a', 'b', 'c', 'd'], 'nothing was silently dropped');
});

test('removeCompare removes by slug, tolerating junk', () => {
  assert.deepEqual(removeCompare([item('a'), item('b')], 'a').map((x) => x.slug), ['b']);
  assert.deepEqual(removeCompare(null, 'a'), []);
  assert.deepEqual(removeCompare([null, {}, item('x')], 'y').map((x) => x.slug), ['x']);
});

test('toggleCompare adds then removes', () => {
  let list = toggleCompare([], item('a'));
  assert.deepEqual(list.map((x) => x.slug), ['a']);
  list = toggleCompare(list, item('a'));
  assert.deepEqual(list, []);
});

test('parseCompare never throws on corrupt storage and enforces the cap', () => {
  assert.deepEqual(parseCompare(''), []);
  assert.deepEqual(parseCompare('not json'), []);
  assert.deepEqual(parseCompare('{"a":1}'), []);
  assert.deepEqual(parseCompare('[{"slug":"a"},null,{"x":1}]').map((x) => x.slug), ['a']);
  const many = JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ slug: `s${i}` })));
  assert.equal(parseCompare(many).length, COMPARE_MAX);
});

test('specRows returns the union of spec keys, sorted', () => {
  assert.deepEqual(specRows([{ specs: { power: '600W', voltage: '230V' } }, { specs: { power: '710W', warranty: '6 months' } }]), ['power', 'voltage', 'warranty']);
  assert.deepEqual(specRows([]), []);
  assert.deepEqual(specRows(null), []);
  assert.deepEqual(specRows([{ specs: null }, {}]), []);
});
