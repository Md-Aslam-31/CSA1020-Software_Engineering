import { POLICY } from './policy.mjs';
import { validateLoans, resolveNow } from './validation.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 60) {
    throw new Error(`${label} must contain 2 to 60 characters.`);
  }
  return value.trim();
}

export function createLoan(input, existingLoans, items, { now } = {}) {
  validateLoans(existingLoans, items);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter the loan details to continue.');
  const item = items.find(candidate => candidate.id === input.itemId);
  if (!item) throw new Error('Choose an item from the equipment catalog.');
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > POLICY.maxUnitsPerLoan) {
    throw new Error(`Choose a whole quantity from 1 to ${POLICY.maxUnitsPerLoan}.`);
  }
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > POLICY.maxLoanDays) {
    throw new Error(`Choose a whole loan duration from 1 to ${POLICY.maxLoanDays} days.`);
  }
  const team = requiredText(input.team, 'Team name');
  const borrower = requiredText(input.borrower, 'Borrower name');
  const used = existingLoans.filter(loan => loan.itemId === item.id && loan.status === 'active')
    .reduce((sum, loan) => sum + loan.quantity, 0);
  const available = item.total - used;
  if (input.quantity > available) throw new Error(`Only ${available} ${available === 1 ? 'unit is' : 'units are'} available for ${item.name}.`);
  const date = resolveNow(now);
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return {
    id: `loan-${id}`,
    itemId: item.id,
    quantity: input.quantity,
    days: input.days,
    team,
    borrower,
    borrowedAt: date.toISOString(),
    dueAt: new Date(date.getTime() + input.days * DAY_MS).toISOString(),
    status: 'active',
  };
}

export function returnLoan(loanId, loans, { now } = {}) {
  if (typeof loanId !== 'string' || !Array.isArray(loans)) throw new Error('Choose an active loan to return.');
  const selected = loans.find(loan => loan?.id === loanId);
  if (!selected) throw new Error('This loan could not be found.');
  if (selected.status !== 'active') throw new Error('This equipment has already been returned.');
  const returnedAt = resolveNow(now);
  if (!Number.isFinite(Date.parse(selected.borrowedAt)) || returnedAt.getTime() < Date.parse(selected.borrowedAt)) {
    throw new Error('The return date cannot be earlier than the loan date.');
  }
  return loans.map(loan => loan.id === loanId
    ? { ...loan, status: 'returned', returnedAt: returnedAt.toISOString() }
    : loan);
}
