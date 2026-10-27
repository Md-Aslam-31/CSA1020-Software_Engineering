import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, searchCatalog } from '../modules/catalog.mjs';
import { POLICY } from '../modules/policy.mjs';

test('catalog contains six unique, immutable equipment items', () => {
  assert.equal(ITEMS.length, 6);
  assert.equal(new Set(ITEMS.map(item => item.id)).size, 6);
  assert.ok(Object.isFrozen(ITEMS) && ITEMS.every(Object.isFrozen));
});

test('catalog search is trimmed and case insensitive', () => {
  assert.deepEqual(searchCatalog(ITEMS, { query: '  CINEMA  ' }).map(item => item.id), ['pocket-camera']);
});

test('description-only search survives the shared policy merge', () => {
  assert.equal(POLICY.searchDescription, true);
  assert.deepEqual(searchCatalog(ITEMS, { query: 'quick-release' }).map(item => item.id), ['field-tripod']);
});

test('category and search constraints apply together', () => {
  assert.equal(searchCatalog(ITEMS, { query: 'interviews', category: 'audio' }).length, 1);
  assert.equal(searchCatalog(ITEMS, { query: 'interviews', category: 'Camera' }).length, 0);
});

test('all and empty filters return separate full result arrays', () => {
  assert.equal(searchCatalog(ITEMS).length, 6);
  assert.equal(searchCatalog(ITEMS, { category: 'All' }).length, 6);
  assert.notEqual(searchCatalog(ITEMS), ITEMS);
});

test('search with no matches returns an empty array', () => {
  assert.deepEqual(searchCatalog(ITEMS, { query: 'spaceship' }), []);
});

test('search rejects nontext filter values', () => {
  assert.throws(() => searchCatalog(ITEMS, { query: 7 }), /must be text/);
});

test('catalog validation rejects duplicate IDs before searching', () => {
  assert.throws(() => searchCatalog([ITEMS[0], ITEMS[0]]), /invalid or duplicate item/);
});
