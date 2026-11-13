import test from 'node:test';
import assert from 'node:assert/strict';
import { isChunkLoadError, markChunkReload, RELOAD_KEY } from '../lib/chunkError.js';

test('recognises Next/React chunk failures', () => {
  assert.equal(isChunkLoadError({ name: 'ChunkLoadError', message: 'Loading chunk 9515 failed.' }), true);
  assert.equal(isChunkLoadError(new Error('Loading chunk 12 failed.\n(error: /_next/static/chunks/12.js)')), true);
  assert.equal(isChunkLoadError(new Error('Failed to fetch dynamically imported module')), true);
  assert.equal(isChunkLoadError(new Error('Minified React error #423')), true);
  assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false);
  assert.equal(isChunkLoadError(null), false);
});

test('reload guard allows one reload per window and then stops', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };
  assert.equal(markChunkReload(storage, 1000), true);
  assert.equal(store.get(RELOAD_KEY), "1000");
  assert.equal(markChunkReload(storage, 2000), false, 'second attempt inside 30s is blocked');
  assert.equal(markChunkReload(storage, 32000), true, 'a later navigation may try again');
  assert.equal(markChunkReload(null), false);
  assert.equal(markChunkReload({ getItem(){throw new Error('no')}, setItem(){} }), false);
});
