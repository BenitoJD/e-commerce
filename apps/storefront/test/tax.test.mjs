import test from 'node:test';
import assert from 'node:assert/strict';
import { splitTax, stateCodeOf, stateName } from '../lib/tax.js';

const SELLER = '27AAPFU0939F1ZV'; // Maharashtra

test('stateCodeOf reads the first two digits and rejects junk', () => {
  assert.equal(stateCodeOf('27AAPFU0939F1ZV'), '27');
  assert.equal(stateCodeOf(' 29 aagcb7383j1z4 '), '29');
  assert.equal(stateCodeOf('99AAPFU0939F1ZV'), null, 'unassigned code');
  assert.equal(stateCodeOf(''), null);
  assert.equal(stateCodeOf(null), null);
  assert.equal(stateName('27'), 'Maharashtra');
  assert.equal(stateName('99'), '');
});

test('intra-state sale splits into CGST + SGST that add back exactly', () => {
  const t = splitTax(1800, { sellerGstin: SELLER, buyerGstin: '27AAPFU0939F1ZV' });
  assert.equal(t.kind, 'intra');
  assert.equal(t.cgstPaise, 900);
  assert.equal(t.sgstPaise, 900);
  assert.equal(t.igstPaise, 0);
  assert.equal(t.cgstPaise + t.sgstPaise + t.igstPaise, 1800);
  assert.equal(t.placeOfSupply, 'Maharashtra');
  assert.equal(t.assumed, false);
});

test('inter-state sale charges IGST and reports the buyer state', () => {
  const t = splitTax(1800, { sellerGstin: SELLER, buyerGstin: '29AAGCB7383J1Z4' });
  assert.equal(t.kind, 'inter');
  assert.equal(t.igstPaise, 1800);
  assert.equal(t.cgstPaise, 0);
  assert.equal(t.sgstPaise, 0);
  assert.equal(t.placeOfSupply, 'Karnataka');
});

test('odd paise never disappear: halves still reconcile', () => {
  const t = splitTax(1801, { sellerGstin: SELLER });
  assert.equal(t.cgstPaise + t.sgstPaise, 1801);
  assert.equal(t.cgstPaise, 900);
  assert.equal(t.sgstPaise, 901);
});

test('buyer without GSTIN falls back to the seller state and is flagged', () => {
  const t = splitTax(1800, { sellerGstin: SELLER });
  assert.equal(t.kind, 'intra');
  assert.equal(t.assumed, true);
  assert.equal(t.placeOfSupply, 'Maharashtra');
});

test('seller state can come from config when the GSTIN is a placeholder', () => {
  // The default store GSTIN is a placeholder with an unusable "00" state code, so the
  // explicit stateCode must drive the split.
  const inter = splitTax(1800, { sellerGstin: '00AAAAA0000A1Z5', sellerStateCode: '27', buyerGstin: '29AAGCB7383J1Z4' });
  assert.equal(inter.kind, 'inter');
  assert.equal(inter.igstPaise, 1800);

  const intra = splitTax(1800, { sellerGstin: '00AAAAA0000A1Z5', sellerStateCode: '27', buyerGstin: '27AAPFU0939F1ZV' });
  assert.equal(intra.kind, 'intra');
  assert.equal(intra.cgstPaise + intra.sgstPaise, 1800);
});

test('splitTax tolerates junk input', () => {
  const t = splitTax(null, {});
  assert.equal(t.totalPaise, 0);
  assert.equal(t.cgstPaise, 0);
  assert.equal(t.placeOfSupplyCode, null);
});
