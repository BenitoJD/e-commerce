import test from 'node:test';
import assert from 'node:assert/strict';
import { numberToIndianWords, paiseToWords } from '../lib/amountWords.js';

test('numberToIndianWords uses lakh/crore grouping', () => {
  assert.equal(numberToIndianWords(0), 'Zero');
  assert.equal(numberToIndianWords(7), 'Seven');
  assert.equal(numberToIndianWords(17), 'Seventeen');
  assert.equal(numberToIndianWords(45), 'Forty Five');
  assert.equal(numberToIndianWords(100), 'One Hundred');
  assert.equal(numberToIndianWords(118), 'One Hundred Eighteen');
  assert.equal(numberToIndianWords(1000), 'One Thousand');
  assert.equal(numberToIndianWords(1234), 'One Thousand Two Hundred Thirty Four');
  // 1,23,456 = one lakh twenty three thousand four hundred fifty six
  assert.equal(numberToIndianWords(123456), 'One Lakh Twenty Three Thousand Four Hundred Fifty Six');
  // 1,23,45,678 = one crore twenty three lakh forty five thousand six hundred seventy eight
  assert.equal(
    numberToIndianWords(12345678),
    'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight'
  );
  assert.equal(numberToIndianWords(10000000), 'One Crore');
  assert.equal(numberToIndianWords(100000), 'One Lakh');
});

test('paiseToWords handles rupees only, paise only and both', () => {
  assert.equal(paiseToWords(118000), 'Rupees One Thousand One Hundred Eighty Only');
  assert.equal(paiseToWords(100), 'Rupees One Only');
  assert.equal(paiseToWords(1), 'Rupees Zero and One Paisa Only');
  assert.equal(paiseToWords(12345), 'Rupees One Hundred Twenty Three and Forty Five Paise Only');
  assert.equal(paiseToWords(0), 'Rupees Zero Only');
});

test('paiseToWords tolerates junk and negatives', () => {
  assert.equal(paiseToWords(null), 'Rupees Zero Only');
  assert.equal(paiseToWords('abc'), 'Rupees Zero Only');
  assert.equal(paiseToWords(-500), 'Rupees Zero Only');
});
