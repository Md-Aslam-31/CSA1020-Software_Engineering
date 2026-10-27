import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, searchCatalog } from '../modules/catalog.mjs';
import { createLoan, returnLoan } from '../modules/loans.mjs';
import { summarize } from '../modules/insights.mjs';

const now = '2026-11-02T10:00:00.000Z';
const input = { itemId: 'pocket-camera', quantity: 1, days: 3, team: 'Atlas team', borrower: 'Alex Kim' };
const makeLoan = (overrides = {}, loans = []) => createLoan({ ...input, ...overrides }, loans, ITEMS, { now });

test('returned units become available for another checkout', () => {
  const first = makeLoan({ quantity: 3 });
  const returned = returnLoan(first.id, [first], { now: '2026-11-03T10:00:00.000Z' });
  assert.equal(makeLoan({ quantity: 3 }, returned).quantity, 3);
});

test('search, checkout, reporting and return preserve both merged policy requirements', () => {
  const [tripod] = searchCatalog(ITEMS, { query: 'quick-release' });
  assert.equal(tripod.id, 'field-tripod');
  const loan = makeLoan({ itemId: tripod.id, quantity: 3, days: 14 });
  assert.equal(summarize(ITEMS, [loan], { now }).borrowedUnits, 3);
  assert.equal(summarize(ITEMS, [loan], { now }).availableUnits, 17);
  const returned = returnLoan(loan.id, [loan], { now: '2026-11-04T10:00:00.000Z' });
  const summary = summarize(ITEMS, returned, { now: '2026-11-05T10:00:00.000Z' });
  assert.equal(summary.borrowedUnits, 0);
  assert.equal(summary.availableUnits, 20);
  assert.equal(summary.overdueLoans, 0);
});
