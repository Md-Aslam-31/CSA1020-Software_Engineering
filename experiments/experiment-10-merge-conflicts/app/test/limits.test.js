import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateSeats, MAX_CAPACITY } from '../src/seat-planner.js';

const person = { id: 'n', name: 'Nia', priority: 'vip' };

test('the supported capacity boundaries are zero and one hundred', () => {
  assert.equal(MAX_CAPACITY, 100);
  assert.equal(allocateSeats([], 0).capacity, 0);
  assert.equal(allocateSeats([person], 100).seatsRemaining, 99);
});

for (const capacity of [-1, 101, 1.5, '3', null, undefined, NaN, Infinity]) {
  test(`rejects invalid capacity ${String(capacity)} (${typeof capacity})`, () => {
    assert.throws(() => allocateSeats([person], capacity), RangeError);
  });
}

test('rejects duplicate attendee IDs', () => {
  assert.throws(() => allocateSeats([person, { ...person, name: 'Another attendee' }], 5), /unique/);
});

test('rejects a non-array roster and incomplete records', () => {
  for (const roster of [null, 'Nia', [null], [{ ...person, id: '' }], [{ ...person, name: ' ' }], [{ ...person, priority: 'unknown' }], new Array(1)]) {
    assert.throws(() => allocateSeats(roster, 3), TypeError);
  }
});
