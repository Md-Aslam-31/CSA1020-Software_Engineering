import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateSeats } from '../src/seat-planner.js';

const attendees = [
  { id: 'a', name: 'Amira', priority: 'standard' },
  { id: 't', name: 'Theo', priority: 'standard' },
  { id: 'n', name: 'Nia', priority: 'vip' },
  { id: 'l', name: 'Luca', priority: 'standard' },
  { id: 'm', name: 'Maya', priority: 'vip' },
  { id: 'o', name: 'Owen', priority: 'standard' }
];

test('VIP attendees take the first seats in their original arrival order', () => {
  const result = allocateSeats(attendees, 3);
  assert.deepEqual(result.confirmed.map(person => person.name), ['Nia', 'Maya', 'Amira']);
  assert.deepEqual(result.waitlist.map(person => person.name), ['Theo', 'Luca', 'Owen']);
});

test('capacity below the VIP count queues the later VIP before standard requests', () => {
  const result = allocateSeats(attendees, 1);
  assert.deepEqual(result.confirmed.map(person => person.name), ['Nia']);
  assert.deepEqual(result.waitlist.map(person => person.name), ['Maya', 'Amira', 'Theo', 'Luca', 'Owen']);
});

test('every request is assigned exactly once to confirmed seats or waiting list', () => {
  const result = allocateSeats(attendees, 2);
  const ids = [...result.confirmed, ...result.waitlist].map(person => person.id);
  assert.equal(ids.length, attendees.length);
  assert.equal(new Set(ids).size, attendees.length);
});

test('zero capacity queues everyone without assigning a seat', () => {
  const result = allocateSeats(attendees, 0);
  assert.deepEqual(result.confirmed, []);
  assert.equal(result.waitlist.length, 6);
  assert.equal(result.seatsRemaining, 0);
});

test('sufficient capacity clears the waiting list', () => {
  const result = allocateSeats(attendees, 8);
  assert.equal(result.confirmed.length, 6);
  assert.deepEqual(result.waitlist, []);
  assert.equal(result.seatsRemaining, 2);
});

test('priority sorting does not mutate a frozen roster or its attendee objects', () => {
  const frozen = Object.freeze(attendees.map(person => Object.freeze({ ...person })));
  assert.equal(allocateSeats(frozen, 3).confirmed[0].name, 'Nia');
  assert.deepEqual(frozen.map(person => person.id), ['a', 't', 'n', 'l', 'm', 'o']);
});
