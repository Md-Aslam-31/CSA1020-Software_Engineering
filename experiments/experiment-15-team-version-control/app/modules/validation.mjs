export function validateItems(items) {
  if (!Array.isArray(items)) throw new Error('The equipment catalog must be a list.');
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)
        || typeof item.name !== 'string' || typeof item.category !== 'string'
        || typeof item.description !== 'string' || !Number.isInteger(item.total) || item.total < 0) {
      throw new Error('The equipment catalog contains an invalid or duplicate item.');
    }
    ids.add(item.id);
  }
  return items;
}

export function resolveNow(value = new Date()) {
  if (!(value instanceof Date) && typeof value !== 'string') throw new Error('The loan date is not valid.');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('The loan date is not valid.');
  return date;
}

export function validateLoans(loans, items) {
  validateItems(items);
  if (!Array.isArray(loans)) throw new Error('Saved loans must be a list.');
  const itemIds = new Set(items.map(item => item.id));
  const loanIds = new Set();
  for (const loan of loans) {
    if (!loan || typeof loan.id !== 'string' || !loan.id || loanIds.has(loan.id)
        || !itemIds.has(loan.itemId) || !Number.isInteger(loan.quantity) || loan.quantity < 1
        || !['active', 'returned'].includes(loan.status)
        || typeof loan.borrowedAt !== 'string' || !Number.isFinite(Date.parse(loan.borrowedAt))
        || typeof loan.dueAt !== 'string' || !Number.isFinite(Date.parse(loan.dueAt))) {
      throw new Error('Saved loans contain an invalid or duplicate record. Reset the sample data to continue.');
    }
    loanIds.add(loan.id);
  }
  for (const item of items) {
    const used = loans.filter(loan => loan.itemId === item.id && loan.status === 'active')
      .reduce((total, loan) => total + loan.quantity, 0);
    if (used > item.total) throw new Error('Saved loans exceed the equipment stock. Reset the sample data to continue.');
  }
  return loans;
}
