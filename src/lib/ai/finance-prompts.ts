import { z } from 'zod/v4';
import type { FinanceTransaction, FinanceTransferChain } from '@/types/index';
import type { MonthAggregates } from '@/lib/finance/aggregate';

// ============================================================
// Extraction
// ============================================================

const amountSchema = z.preprocess((v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    // strip currency symbols, thousands separators; allow comma-decimal (e.g. "1.234,56")
    let s = v.replace(/[^\d.,\-+]/g, '').trim();
    if (s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
    const n = Number(s);
    return isFinite(n) ? n : v;
  }
  return v;
}, z.number());

const currencySchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
  z.string().length(3)
);

const VALID_KINDS = ['income', 'expense', 'transfer_out', 'transfer_in', 'transfer_fee'] as const;
type Kind = (typeof VALID_KINDS)[number];

function normalizeKind(rawKind: unknown, amount: number, description: string): Kind {
  if (typeof rawKind === 'string') {
    const k = rawKind.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if ((VALID_KINDS as readonly string[]).includes(k)) return k as Kind;
    // Synonyms
    if (k === 'transferout' || k === 'transfer_sent' || k === 'outgoing_transfer') return 'transfer_out';
    if (k === 'transferin' || k === 'transfer_received' || k === 'incoming_transfer') return 'transfer_in';
    if (k === 'fee' || k === 'charge' || k === 'tax' || k === 'iof' || k === 'tarifa') return 'transfer_fee';
    if (k === 'salary' || k === 'deposit' || k === 'credit' || k === 'refund' || k === 'income') return 'income';
    if (k === 'purchase' || k === 'debit' || k === 'payment' || k === 'expense') return 'expense';
    if (k === 'transfer') {
      // Bare "transfer" — use amount sign to pick a leg
      return amount >= 0 ? 'transfer_in' : 'transfer_out';
    }
  }
  // Last-resort fallback by sign + description keywords
  const desc = description.toLowerCase();
  const looksLikeFee = /\b(fee|charge|iof|tarifa|tax)\b/.test(desc);
  if (looksLikeFee) return 'transfer_fee';
  return amount >= 0 ? 'income' : 'expense';
}

export const ExtractedTransactionSchema = z
  .object({
    occurred_on: z.string(),
    description: z.string().default(''),
    amount: amountSchema,
    currency: currencySchema,
    kind: z.unknown(),
    category: z.string().default('other'),
  })
  .transform((t) => ({
    occurred_on: t.occurred_on,
    description: t.description,
    amount: t.amount,
    currency: t.currency,
    kind: normalizeKind(t.kind, t.amount, t.description),
    category: t.category,
  }));

// Accept both `{ transactions: [...] }` and a bare `[...]` array — some models
// slip and emit the array directly despite the prompt asking for the wrapped form.
export const ExtractionSchema = z.preprocess(
  (val) => (Array.isArray(val) ? { transactions: val } : val),
  z.object({
    transactions: z.array(ExtractedTransactionSchema),
  })
);

export type ExtractedTransaction = z.infer<typeof ExtractedTransactionSchema>;

export const EXTRACTION_SYSTEM = `You are a meticulous accounting assistant that extracts transactions from raw bank-statement text.

For each transaction in the input, return one entry in the "transactions" array with these fields:
- occurred_on: ISO date YYYY-MM-DD
- description: original line description, trimmed
- amount: number, signed. Negative = money leaving the account, positive = money arriving.
- currency: ISO 4217 three-letter code. Detect per-row. Common: USD, BRL, EUR, GBP.
- kind: one of:
  - "income"        — external deposit (salary, client payment, refund).
  - "expense"       — outflow to a third party (groceries, rent, subscription, taxes).
  - "transfer_out"  — money LEAVING this account heading to ANOTHER ACCOUNT THE USER OWNS (Payoneer/Wise/Nubank/PayPal/Revolut style). Words like "transfer to", "wire to", "withdrawal to", "send to <own account>" are hints.
  - "transfer_in"   — money ARRIVING in this account FROM another account the user owns.
  - "transfer_fee"  — fees charged for a transfer (look for "fee", "charge", "tarifa", "IOF", "wire fee", "FX margin") usually on the same date as a transfer_out.
- category: one of: groceries, housing, subscription, transport, utilities, dining, entertainment, salary, transfer, fee, healthcare, education, other.

Respond with ONLY valid JSON of the form:
{"transactions": [ {...}, {...} ]}
No prose, no markdown fences.`;

export function buildExtractionUserPrompt(
  chunk: string,
  accountLabel: string,
  knownAccountLabels: string[]
): string {
  const known = knownAccountLabels.length
    ? knownAccountLabels.join(', ')
    : 'Payoneer, Wise, Nubank, PayPal, Revolut';
  return `Source account: ${accountLabel || 'unknown'}
Other accounts the user owns (treat moves to/from these as transfer_out/transfer_in, NOT income/expense): ${known}

Raw statement text:
"""
${chunk}
"""`;
}

// ============================================================
// Pattern detection
// ============================================================

export const PatternProposalSchema = z.object({
  label: z.string(),
  amount: z.number(),
  currency: z.string().length(3),
  cadence: z.enum(['monthly', 'weekly', 'yearly', 'custom']),
  day_of_month: z.number().int().min(1).max(31).nullable(),
  category: z.string(),
  sample_transaction_ids: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const PatternsSchema = z.object({
  patterns: z.array(PatternProposalSchema),
});

export type PatternProposal = z.infer<typeof PatternProposalSchema>;

export const PATTERN_SYSTEM = `You identify recurring expense patterns from a list of transactions.
Return only patterns that appear in at least 2 distinct months.
Each pattern: label (merchant name), amount (typical value), currency, cadence, day_of_month (best guess), category, sample_transaction_ids (uuids of the matching transactions), confidence (0–1).
Respond with valid JSON: {"patterns": [...]}. No markdown.`;

export function buildPatternUserPrompt(transactions: FinanceTransaction[]): string {
  const rows = transactions
    .map((t) => `${t.id} | ${t.occurred_on} | ${t.currency} ${t.amount} | ${t.description}`)
    .join('\n');
  return `Here are recent expense transactions (id | date | amount | description):

${rows}

Identify recurring (monthly/weekly/yearly) charges. Skip one-offs.`;
}

// ============================================================
// Analysis (preset + freeform)
// ============================================================

const severitySchema = z.preprocess((v) => {
  if (typeof v !== 'string') return v;
  const s = v.trim().toLowerCase();
  if (s === 'warning' || s === 'warn') return 'warn';
  if (s === 'critical' || s === 'high' || s === 'severe' || s === 'error') return 'critical';
  if (s === 'info' || s === 'low' || s === 'note' || s === 'medium') return 'info';
  return s;
}, z.enum(['info', 'warn', 'critical']));

const nullableCurrencySchema = z.preprocess((v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') {
    const s = v.trim().toUpperCase();
    return s.length === 3 ? s : null;
  }
  return v;
}, z.string().length(3).nullable());

const nullableNumberSchema = z.preprocess((v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.\-+]/g, ''));
    return isFinite(n) ? n : null;
  }
  return v;
}, z.number().nullable());

export const FinanceAnalysisSchema = z.object({
  overview: z.string().default(''),
  findings: z
    .array(
      z.object({
        title: z.string().default(''),
        detail: z.string().default(''),
        severity: severitySchema.default('info'),
      })
    )
    .default([]),
  suggestions: z
    .array(
      z.object({
        action: z.string().default(''),
        estimated_savings: nullableNumberSchema.default(null),
        currency: nullableCurrencySchema.default(null),
      })
    )
    .default([]),
  cited_transaction_ids: z.array(z.string()).default([]),
});

export const ANALYSIS_SYSTEM = `You are a personal finance analyst. Analyze the provided transactions and aggregates and produce a structured JSON report.

Schema:
{
  "overview": "short paragraph",
  "findings": [ { "title": "...", "detail": "...", "severity": "info|warn|critical" } ],
  "suggestions": [ { "action": "...", "estimated_savings": number|null, "currency": "USD"|"BRL"|...|null } ],
  "cited_transaction_ids": ["uuid", ...]
}

Rules:
- Never double-count transfers between the user's own accounts. Income only counts transactions of kind="income".
- Quote specific transaction ids in cited_transaction_ids when you reference them.
- Respond with valid JSON only. No markdown fences.`;

export interface AnalysisContext {
  month: string;
  transactions: FinanceTransaction[];
  prevTransactions: FinanceTransaction[];
  chains: FinanceTransferChain[];
  aggregates: MonthAggregates;
  prevAggregates: MonthAggregates;
}

export const ANALYSIS_PRESETS: Record<string, string> = {
  cut_expenses:
    'Identify the top categories where the user is overspending this month and propose 3–5 concrete cuts with estimated savings.',
  subscriptions_audit:
    'Find every likely subscription (Netflix-style recurring) and rate each as "essential", "nice-to-have", or "candidate to cancel". Quote ids.',
  month_over_month:
    'Compare this month to the previous month. Highlight the 3 biggest swings (categories that grew or shrunk the most) and explain.',
  anomaly_detection:
    'Find transactions that look unusual (much larger than typical for their category, duplicate charges, or unrecognized merchants).',
  cashflow_summary:
    'Summarize the cash flow: income, expenses, fees, net. Call out anything notable about timing or concentration.',
};

function summarizeTx(t: FinanceTransaction): string {
  return `${t.id} | ${t.occurred_on} | ${t.kind} | ${t.currency} ${t.amount} | ${t.category} | ${t.description}`;
}

export function buildAnalysisUserPrompt(
  promptText: string,
  ctx: AnalysisContext
): string {
  const txList = ctx.transactions.map(summarizeTx).join('\n');
  const prevList = ctx.prevTransactions.map(summarizeTx).join('\n');
  return `Month: ${ctx.month}

Aggregates (this month):
${JSON.stringify(ctx.aggregates, null, 2)}

Aggregates (previous month):
${JSON.stringify(ctx.prevAggregates, null, 2)}

Transfer chains detected this month:
${JSON.stringify(ctx.chains, null, 2)}

Transactions this month (id | date | kind | amount | category | description):
${txList || '(none)'}

Transactions previous month:
${prevList || '(none)'}

Task: ${promptText}`;
}
