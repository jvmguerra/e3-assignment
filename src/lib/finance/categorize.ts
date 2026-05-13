export function normalizeMerchant(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b\d{2,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export const KNOWN_ACCOUNT_HINTS = [
  'payoneer',
  'wise',
  'nubank',
  'transferwise',
  'paypal',
  'revolut',
] as const;

export function isLikelyOwnAccountTransfer(description: string): boolean {
  const lower = description.toLowerCase();
  return KNOWN_ACCOUNT_HINTS.some((h) => lower.includes(h));
}
