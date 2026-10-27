import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../modules/insights.mjs';

const now = '2026-11-02T10:00:00.000Z';
const ITEMS = [
  { id: 'pocket-camera', name: 'Camera', category: 'Camera', total: 3, description: 'Camera kit' },
  { id: 'audio', name: 'Audio gear', category: 'Audio', total: 7, description: 'Audio kit' },
  { id: 'lighting', name: 'Lighting gear', category: 'Lighting', total: 10, description: 'Lighting kit' },
];
const makeLoan = (overrides = {}) => {
  const days = overrides.days ?? 3;
  return { id: 'loan-fixture', itemId: 'pocket-camera', quantity: 1, team: 'Atlas', borrower: 'Alex Kim', days,
    borrowedAt: now, dueAt: new Date(Date.parse(now) + days * 86400000).toISOString(), status: 'active', ...overrides };
};

test('summary conserves stock and groups category utilization', () => {
  const loan = makeLoan({ quantity: 2 });
  const summary = summarize(ITEMS, [loan], { now });
  assert.equal(summary.totalUnits, 20);
  assert.equal(summary.activeLoans, 1);
  assert.equal(summary.borrowedUnits, 2);
  assert.equal(summary.availableUnits, 18);
  assert.equal(summary.utilizationPercent, 10);
  assert.deepEqual(summary.byCategory.find(group => group.category === 'Camera'), { category: 'Camera', total: 3, borrowed: 2 });
});

test('overdue metrics exclude returned loans and the exact due boundary', () => {
  const loan = makeLoan({ days: 1 });
  assert.equal(summarize(ITEMS, [loan], { now: loan.dueAt }).overdueLoans, 0);
  assert.equal(summarize(ITEMS, [loan], { now: '2026-11-03T10:00:00.001Z' }).overdueLoans, 1);
  const returned = [{ ...loan, status: 'returned', returnedAt: '2026-11-04T10:00:00.000Z' }];
  assert.equal(summarize(ITEMS, returned, { now: '2026-11-05T10:00:00.000Z' }).overdueLoans, 0);
  assert.equal(summarize(ITEMS, returned, { now }).borrowedUnits, 0);
});

test('empty inventory summary has zero utilization without NaN', () => {
  assert.deepEqual(summarize([], [], { now }), {
    totalUnits: 0, activeLoans: 0, borrowedUnits: 0, availableUnits: 0,
    utilizationPercent: 0, overdueLoans: 0, byCategory: [],
  });
});

test('malformed, duplicate and overbooked saved state is rejected', () => {
  const loan = makeLoan();
  assert.throws(() => summarize(ITEMS, [{ ...loan, quantity: -1 }], { now }), /invalid or duplicate/);
  assert.throws(() => summarize(ITEMS, [loan, loan], { now }), /invalid or duplicate/);
  assert.throws(() => summarize(ITEMS, [{ ...loan, quantity: 4 }], { now }), /exceed the equipment stock/);
});
