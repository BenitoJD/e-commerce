import test from 'node:test';
import assert from 'node:assert/strict';
import { pushRecent, parseRecent } from '../lib/recent.js';

test('pushRecent puts the newest first and caps the list', () => {
  let list = [];
  for (const slug of ['a', 'b', 'c']) list = pushRecent(list, { slug, name: slug.toUpperCase(), price: 10 }, { max: 3 });
  assert.deepEqual(list.map((i) => i.slug), ['c', 'b', 'a']);
  list = pushRecent(list, { slug: 'd', name: 'D' }, { max: 3 });
  assert.deepEqual(list.map((i) => i.slug), ['d', 'c', 'b'], 'oldest falls off');
});

test('pushRecent de-duplicates by moving an existing product to the front', () => {
  const list = pushRecent(
    [{ slug: 'a' }, { slug: 'b' }],
    { slug: 'a', name: 'A again', price: 50 }
  );
  assert.deepEqual(list.map((i) => i.slug), ['a', 'b']);
  assert.equal(list.filter((i) => i.slug === 'a').length, 1);
  assert.equal(list[0].price, 50, 'refreshed details win');
});

test('pushRecent tolerates junk input and missing fields', () => {
  assert.deepEqual(pushRecent(null, null), []);
  assert.deepEqual(pushRecent([null, {}, { slug: 'x' }], null), [{ slug: 'x' }]);
  const withJunkPrice = pushRecent([], { slug: 'p', price: 'abc' });
  assert.equal(withJunkPrice[0].price, 0);
  assert.equal(withJunkPrice[0].name, 'p', 'falls back to slug for the name');
});

test('parseRecent never throws on corrupt storage', () => {
  assert.deepEqual(parseRecent(''), []);
  assert.deepEqual(parseRecent(null), []);
  assert.deepEqual(parseRecent('not json'), []);
  assert.deepEqual(parseRecent('{"a":1}'), []);
  assert.deepEqual(parseRecent('[{"slug":"a"},null,{"nope":1}]'), [{ slug: 'a' }]);
});
