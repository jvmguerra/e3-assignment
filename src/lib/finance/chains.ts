// Transfer-chain builder.
//
// Given a flat list of transactions for an org, walk transfer_out → transfer_in
// hops across documents (e.g. Payoneer→Wise→Nubank), pair transfer_fee rows to
// the chain, and produce one logical chain record per multi-hop transfer.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FinanceTransaction } from '@/types/index';

const HOP_DAYS = 7;
const PAIR_DAYS = 3;
const FEE_DAYS = 3;

interface InternalLeg {
  out: FinanceTransaction;
  in: FinanceTransaction;
  fees: FinanceTransaction[];
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + 'T00:00:00Z').getTime();
  const b = new Date(bIso + 'T00:00:00Z').getTime();
  return Math.abs(a - b) / (24 * 60 * 60 * 1000);
}

function findInLeg(
  outTx: FinanceTransaction,
  candidates: FinanceTransaction[]
): FinanceTransaction | null {
  const outAbs = Math.abs(Number(outTx.amount));
  // 1) Same-currency match: amount close to (outAbs - small fee delta)
  let best: { tx: FinanceTransaction; score: number } | null = null;
  for (const c of candidates) {
    if (c.kind !== 'transfer_in') continue;
    if (c.document_id === outTx.document_id) continue;
    if (daysBetween(c.occurred_on, outTx.occurred_on) > PAIR_DAYS) continue;
    const cAbs = Math.abs(Number(c.amount));
    if (c.currency === outTx.currency) {
      // 0 ≤ outAbs - cAbs ≤ 0.1 * outAbs (allow up to 10% fee shave)
      const delta = outAbs - cAbs;
      if (delta >= 0 && delta <= Math.max(1, outAbs * 0.1)) {
        const score = -delta;
        if (!best || score > best.score) best = { tx: c, score };
      }
    } else {
      // Different currency: any plausible match — must be within ±7 days and amount > 0.
      // We can't sanity-check the FX rate without a reference, so we accept the
      // closest-date candidate that hasn't been claimed yet.
      if (cAbs > 0) {
        const score = -daysBetween(c.occurred_on, outTx.occurred_on);
        if (!best || score > best.score) best = { tx: c, score };
      }
    }
  }
  return best?.tx ?? null;
}

function findFees(
  outTx: FinanceTransaction,
  candidates: FinanceTransaction[]
): FinanceTransaction[] {
  // Fees are transfer_fee rows on the same document (typically the source account)
  // within ±FEE_DAYS of the transfer_out date.
  return candidates.filter(
    (c) =>
      c.kind === 'transfer_fee' &&
      c.document_id === outTx.document_id &&
      daysBetween(c.occurred_on, outTx.occurred_on) <= FEE_DAYS
  );
}

interface BuiltChain {
  org_id: string;
  source_transaction_id: string;
  final_transaction_id: string;
  leg_transaction_ids: string[];
  fee_transaction_ids: string[];
  total_fees_by_currency: Record<string, number>;
  net_landed_amount: number;
  net_landed_currency: string;
  effective_rate: Record<string, number>;
  source_amount: number;
  source_currency: string;
  earliest_date: string;
}

/**
 * Walk all unchained transfer_out rows and produce chain records.
 * Pure function — no DB writes. The caller persists the result.
 */
export function buildChains(transactions: FinanceTransaction[]): BuiltChain[] {
  const claimedIn = new Set<string>();
  const claimedFee = new Set<string>();
  const chained = new Set<string>();
  const chains: BuiltChain[] = [];

  // Index by date for stability
  const sorted = [...transactions].sort((a, b) => (a.occurred_on < b.occurred_on ? -1 : 1));

  for (const outTx of sorted) {
    if (outTx.kind !== 'transfer_out') continue;
    if (chained.has(outTx.id)) continue;

    // Walk forward, hop by hop
    const legs: InternalLeg[] = [];
    let cursor: FinanceTransaction = outTx;
    let safety = 0;
    while (safety++ < 8) {
      const candidates = sorted.filter((t) => !claimedIn.has(t.id) && t.id !== cursor.id);
      const inTx = findInLeg(cursor, candidates);
      if (!inTx) break;
      const fees = findFees(cursor, sorted.filter((t) => !claimedFee.has(t.id)));
      legs.push({ out: cursor, in: inTx, fees });
      claimedIn.add(inTx.id);
      chained.add(cursor.id);
      chained.add(inTx.id);
      for (const f of fees) claimedFee.add(f.id);

      // Look for the next hop: a transfer_out on the same document as inTx within ±HOP_DAYS
      const nextHop = sorted.find(
        (t) =>
          t.kind === 'transfer_out' &&
          t.document_id === inTx.document_id &&
          !chained.has(t.id) &&
          daysBetween(t.occurred_on, inTx.occurred_on) <= HOP_DAYS
      );
      if (!nextHop) break;
      cursor = nextHop;
    }

    if (legs.length === 0) continue;

    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];
    const legIds: string[] = [];
    const feeIds: string[] = [];
    const feesByCurrency: Record<string, number> = {};
    for (const l of legs) {
      legIds.push(l.out.id, l.in.id);
      for (const f of l.fees) {
        feeIds.push(f.id);
        feesByCurrency[f.currency] = (feesByCurrency[f.currency] ?? 0) + Math.abs(Number(f.amount));
      }
    }

    const sourceAmount = Math.abs(Number(firstLeg.out.amount));
    const sourceCurrency = firstLeg.out.currency;
    const netLandedAmount = Math.abs(Number(lastLeg.in.amount));
    const netLandedCurrency = lastLeg.in.currency;

    // Effective rate (after fees) from source currency to landed currency
    const effectiveRate: Record<string, number> = {};
    if (sourceAmount > 0 && netLandedCurrency !== sourceCurrency) {
      const key = `${sourceCurrency}_to_${netLandedCurrency}`;
      effectiveRate[key] = +(netLandedAmount / sourceAmount).toFixed(8);
    }

    chains.push({
      org_id: firstLeg.out.org_id,
      source_transaction_id: firstLeg.out.id,
      final_transaction_id: lastLeg.in.id,
      leg_transaction_ids: legIds,
      fee_transaction_ids: feeIds,
      total_fees_by_currency: feesByCurrency,
      net_landed_amount: netLandedAmount,
      net_landed_currency: netLandedCurrency,
      effective_rate: effectiveRate,
      source_amount: sourceAmount,
      source_currency: sourceCurrency,
      earliest_date: firstLeg.out.occurred_on,
    });
  }

  return chains;
}

/**
 * Persists chains to DB. Inserts finance_transfer_chains, updates legs with chain_id,
 * and writes finance_fx_observations for cross-currency chains.
 */
export async function persistChains(
  supabase: SupabaseClient,
  orgId: string,
  chains: BuiltChain[]
): Promise<void> {
  for (const c of chains) {
    const { data: chainRow, error: chainErr } = await supabase
      .from('finance_transfer_chains')
      .insert({
        org_id: orgId,
        source_transaction_id: c.source_transaction_id,
        final_transaction_id: c.final_transaction_id,
        leg_transaction_ids: c.leg_transaction_ids,
        total_fees_by_currency: c.total_fees_by_currency,
        net_landed_amount: c.net_landed_amount,
        net_landed_currency: c.net_landed_currency,
        effective_rate: c.effective_rate,
      })
      .select('id')
      .single();

    if (chainErr || !chainRow) {
      console.error('persistChains: insert chain failed', chainErr);
      continue;
    }

    const allTxIds = [...c.leg_transaction_ids, ...c.fee_transaction_ids];
    await supabase
      .from('finance_transactions')
      .update({ chain_id: chainRow.id })
      .in('id', allTxIds);

    if (c.source_currency !== c.net_landed_currency) {
      await supabase.from('finance_fx_observations').insert({
        org_id: orgId,
        from_currency: c.source_currency,
        to_currency: c.net_landed_currency,
        from_amount: c.source_amount,
        to_amount: c.net_landed_amount,
        implied_rate: +(c.net_landed_amount / c.source_amount).toFixed(8),
        observed_on: c.earliest_date,
        chain_id: chainRow.id,
        source_transaction_ids: c.leg_transaction_ids,
      });
    }
  }
}
