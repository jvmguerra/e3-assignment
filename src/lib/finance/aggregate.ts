// Chain-aware aggregation: total income, expenses, fees, net cash flow
// — all bucketed by currency. Used by analysis page + analysis route prompts.

import type { FinanceTransaction, FinanceTransferChain } from '@/types/index';

export interface MonthAggregates {
  income_by_currency: Record<string, number>;
  expenses_by_currency: Record<string, number>;
  fees_by_currency: Record<string, number>;
  net_by_currency: Record<string, number>;
  unmatched_transfers_by_currency: Record<string, number>;
  expenses_by_category: Record<string, Record<string, number>>; // category -> currency -> total
  transaction_count: number;
}

function bump(map: Record<string, number>, currency: string, delta: number) {
  map[currency] = (map[currency] ?? 0) + delta;
}

export function aggregate(
  transactions: FinanceTransaction[],
  chains: FinanceTransferChain[]
): MonthAggregates {
  const chainIds = new Set(chains.map((c) => c.id));

  const out: MonthAggregates = {
    income_by_currency: {},
    expenses_by_currency: {},
    fees_by_currency: {},
    net_by_currency: {},
    unmatched_transfers_by_currency: {},
    expenses_by_category: {},
    transaction_count: transactions.length,
  };

  for (const t of transactions) {
    const c = t.currency;
    const abs = Math.abs(Number(t.amount));
    switch (t.kind) {
      case 'income':
        bump(out.income_by_currency, c, abs);
        break;
      case 'expense':
        bump(out.expenses_by_currency, c, abs);
        if (!out.expenses_by_category[t.category]) out.expenses_by_category[t.category] = {};
        bump(out.expenses_by_category[t.category], c, abs);
        break;
      case 'transfer_fee':
        bump(out.fees_by_currency, c, abs);
        break;
      case 'transfer_out':
      case 'transfer_in':
        // Linked legs cancel out by design. Unlinked legs are surfaced separately.
        if (!t.chain_id || !chainIds.has(t.chain_id)) {
          bump(out.unmatched_transfers_by_currency, c, abs);
        }
        break;
    }
  }

  const allCurrencies = new Set<string>([
    ...Object.keys(out.income_by_currency),
    ...Object.keys(out.expenses_by_currency),
    ...Object.keys(out.fees_by_currency),
  ]);
  for (const c of allCurrencies) {
    out.net_by_currency[c] =
      (out.income_by_currency[c] ?? 0) -
      (out.expenses_by_currency[c] ?? 0) -
      (out.fees_by_currency[c] ?? 0);
  }

  return out;
}
