import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateSeats } from '../src/seat-planner.js';

const attendees = ['Asha', 'Noah', 'Lina'].map((name, index) => ({
  id: `attendee-${index}`, name, priority: 'standard'
}));

test('standard attendees retain arrival order when seats are limited', () => {
  assert.deepEqual(allocateSeats(attendees, 2).confirmed.map(person => person.name), ['Asha', 'Noah']);
});

test('unused seats remain available', () => {
  const result = allocateSeats(attendees, 5);
  assert.equal(result.seatsRemaining, 2);
  assert.equal(result.totalRequests, 3);
});

test('an empty workshop keeps all seats available', () => {
  const result = allocateSeats([], 5);
  assert.deepEqual(result.confirmed, []);
  assert.equal(result.seatsRemaining, 5);
});
