import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoan, returnLoan } from '../modules/loans.mjs';

const now = '2026-11-02T10:00:00.000Z';
const input = { itemId: 'pocket-camera', quantity: 1, days: 3, team: 'Atlas team', borrower: 'Alex Kim' };
const ITEMS = [{ id: 'pocket-camera', name: 'Pocket cinema camera', category: 'Camera', total: 3, description: 'A compact camera kit' }];
const makeLoan = (overrides = {}, loans = []) => createLoan({ ...input, ...overrides }, loans, ITEMS, { now });

test('new loan trims team details and calculates due date exactly', () => {
  const loan = makeLoan({ borrower: '  Alex Kim ', team: ' Atlas team ' });
  assert.equal(loan.borrower, 'Alex Kim');
  assert.equal(loan.team, 'Atlas team');
  assert.equal(loan.borrowedAt, now);
  assert.equal(loan.dueAt, '2026-11-05T10:00:00.000Z');
  assert.equal(loan.status, 'active');
  assert.ok(loan.id.startsWith('loan-'));
});

test('merged loan limits permit three units for fourteen days', () => {
  const loan = makeLoan({ quantity: 3, days: 14 });
  assert.equal(loan.quantity, 3);
  assert.equal(loan.days, 14);
});

test('loan rejects unavailable quantities without changing history', () => {
  const loans = [makeLoan({ quantity: 2 })];
  const before = structuredClone(loans);
  assert.throws(() => makeLoan({ quantity: 2 }, loans), /Only 1 unit is available/);
  assert.deepEqual(loans, before);
});

test('quantity validation rejects fractions, zero, excessive and nonnumeric values', () => {
  for (const quantity of [0, -1, 1.5, 4, '2', NaN, Infinity, null]) {
    assert.throws(() => makeLoan({ quantity }), /whole quantity/);
  }
});

test('duration validation rejects out of bounds and nonnumeric values', () => {
  for (const days of [0, -1, 1.5, 15, '3', NaN, Infinity, null]) {
    assert.throws(() => makeLoan({ days }), /loan duration/);
  }
});

test('loan requires known equipment and meaningful team details', () => {
  assert.throws(() => makeLoan({ itemId: 'unknown' }), /Choose an item/);
  assert.throws(() => makeLoan({ team: ' ' }), /Team name/);
  assert.throws(() => makeLoan({ borrower: 'x' }), /Borrower name/);
});

test('date injection accepts Date objects and rejects invalid dates', () => {
  assert.equal(createLoan(input, [], ITEMS, { now: new Date(now) }).borrowedAt, now);
  assert.throws(() => createLoan(input, [], ITEMS, { now: 'not-a-date' }), /loan date/);
});

test('return creates a new history without mutating the original loan', () => {
  const loan = makeLoan();
  const loans = [loan];
  const returned = returnLoan(loan.id, loans, { now: '2026-11-03T10:00:00.000Z' });
  assert.notEqual(returned, loans);
  assert.equal(loan.status, 'active');
  assert.equal(returned[0].status, 'returned');
  assert.equal(returned[0].returnedAt, '2026-11-03T10:00:00.000Z');
});

test('duplicate return and unknown loans produce clear errors', () => {
  const loan = makeLoan();
  const returned = returnLoan(loan.id, [loan], { now });
  assert.throws(() => returnLoan(loan.id, returned, { now }), /already been returned/);
  assert.throws(() => returnLoan('missing', [loan], { now }), /could not be found/);
});

test('return cannot precede the borrowing time', () => {
  const loan = makeLoan();
  assert.throws(() => returnLoan(loan.id, [loan], { now: '2026-11-01T10:00:00.000Z' }), /earlier/);
});
