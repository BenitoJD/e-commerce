const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeLike, clampInt, sortClause } = require('../text');

test('escapeLike escapes %, _, backslash', () => {
  assert.equal(escapeLike('100%'), '100\\%');
  assert.equal(escapeLike('a_b'), 'a\\_b');
  assert.equal(escapeLike('a\\b'), 'a\\\\b');
  assert.equal(escapeLike('plain'), 'plain');
  assert.equal(escapeLike(''), '');
  assert.equal(escapeLike(null), '');
});

test('escapeLike output used with ESCAPE matches literally', () => {
  // Simulates Postgres: pattern %<escaped>% with ESCAPE '\'
  const pattern = `%${escapeLike('100%_x')}%`;
  assert.equal(pattern, '%100\\%\\_x%');
});

test('clampInt defaults and clamps', () => {
  assert.equal(clampInt('20', 20, 1, 50), 20);
  assert.equal(clampInt('999', 20, 1, 50), 50);
  assert.equal(clampInt('0', 20, 1, 50), 1);
  assert.equal(clampInt('abc', 20, 1, 50), 20);
  assert.equal(clampInt(undefined, 20, 1, 50), 20);
  assert.equal(clampInt('-5', 0, 0, 1000), 0);
});

test('sortClause only ever returns allowlisted fragments', () => {
  assert.equal(sortClause('low'), 'price_paise ASC, id DESC');
  assert.equal(sortClause('high'), 'price_paise DESC, id DESC');
  assert.equal(sortClause('new'), 'created_at DESC, id DESC');
  assert.equal(sortClause('popular'), 'created_at DESC, id DESC');
  assert.equal(sortClause('price_paise ASC; DROP TABLE products; --'), 'created_at DESC, id DESC');
  assert.equal(sortClause(''), 'created_at DESC, id DESC');
  assert.equal(sortClause(undefined), 'created_at DESC, id DESC');
});
