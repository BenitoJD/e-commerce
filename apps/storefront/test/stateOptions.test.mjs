import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStates, stateFieldRequired, stateForPayload } from '../lib/stateOptions.js';

test('normalizeStates accepts both response shapes and drops junk', () => {
  assert.deepEqual(normalizeStates({ states: [{ code: '27', name: 'Maharashtra' }] }), [{ code: '27', name: 'Maharashtra' }]);
  assert.deepEqual(normalizeStates([{ code: '29', name: 'Karnataka' }]), [{ code: '29', name: 'Karnataka' }]);
  assert.deepEqual(normalizeStates({ states: [null, {}, { code: '27' }, { name: 'X' }] }), []);
  assert.deepEqual(normalizeStates(null), []);
  assert.deepEqual(normalizeStates({ error: 'boom' }), []);
  // Numeric codes are coerced, so comparisons stay string-based.
  assert.deepEqual(normalizeStates([{ code: 7, name: 'Delhi' }]), [{ code: '7', name: 'Delhi' }]);
});

test('the state field is required only when options loaded', () => {
  assert.equal(stateFieldRequired([{ code: '27', name: 'Maharashtra' }]), true);
  assert.equal(stateFieldRequired([]), false, 'a failed /store/states call must not block checkout');
  assert.equal(stateFieldRequired(null), false);
});

test('stateForPayload only sends a code the list actually offers', () => {
  const options = [{ code: '27', name: 'Maharashtra' }, { code: '29', name: 'Karnataka' }];
  assert.equal(stateForPayload(options, '29'), '29');
  assert.equal(stateForPayload(options, ''), null);
  assert.equal(stateForPayload(options, '99'), null, 'unknown code is not sent');
  assert.equal(stateForPayload([], '27'), null, 'without a list nothing is claimed');
});
