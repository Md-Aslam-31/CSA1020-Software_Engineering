import { validateLoans, resolveNow } from './validation.mjs';

export function summarize(items, loans, { now } = {}) {
  validateLoans(loans, items);
  const time = resolveNow(now).getTime();
  const active = loans.filter(loan => loan.status === 'active');
  const totalUnits = items.reduce((sum, item) => sum + item.total, 0);
  const borrowedUnits = active.reduce((sum, loan) => sum + loan.quantity, 0);
  const byCategory = new Map();
  for (const item of items) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, { category: item.category, total: 0, borrowed: 0 });
    const category = byCategory.get(item.category);
    category.total += item.total;
    category.borrowed += active.filter(loan => loan.itemId === item.id).reduce((sum, loan) => sum + loan.quantity, 0);
  }
  return {
    totalUnits,
    activeLoans: active.length,
    borrowedUnits,
    availableUnits: totalUnits - borrowedUnits,
    utilizationPercent: totalUnits === 0 ? 0 : Math.round((borrowedUnits / totalUnits) * 100),
    overdueLoans: active.filter(loan => Date.parse(loan.dueAt) < time).length,
    byCategory: [...byCategory.values()],
  };
}
