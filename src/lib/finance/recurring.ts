// Expand recurring rules into concrete occurrences within a date window.

import type { FinanceRecurring } from '@/types/index';

export interface RecurringOccurrence {
  recurring_id: string;
  date: string; // YYYY-MM-DD
  label: string;
  amount: number;
  currency: string;
  category: string;
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function withinWindow(d: Date, windowStart: Date, windowEnd: Date): boolean {
  return d.getTime() >= windowStart.getTime() && d.getTime() <= windowEnd.getTime();
}

function clampToMonthEnd(year: number, month: number, day: number): Date {
  // month is 0-indexed for Date; we use UTC throughout to avoid TZ drift
  const lastOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastOfMonth)));
}

export function expandRecurring(
  rules: FinanceRecurring[],
  windowStartIso: string,
  windowEndIso: string
): RecurringOccurrence[] {
  const windowStart = new Date(windowStartIso + 'T00:00:00Z');
  const windowEnd = new Date(windowEndIso + 'T00:00:00Z');
  const out: RecurringOccurrence[] = [];

  for (const r of rules) {
    const start = new Date(r.start_date + 'T00:00:00Z');
    const end = r.end_date ? new Date(r.end_date + 'T00:00:00Z') : null;

    const effectiveStart = start.getTime() > windowStart.getTime() ? start : windowStart;
    const effectiveEnd = end && end.getTime() < windowEnd.getTime() ? end : windowEnd;

    if (effectiveStart.getTime() > effectiveEnd.getTime()) continue;

    if (r.cadence === 'monthly') {
      const day = r.day_of_month ?? start.getUTCDate();
      const startYear = effectiveStart.getUTCFullYear();
      const startMonth = effectiveStart.getUTCMonth();
      const endYear = effectiveEnd.getUTCFullYear();
      const endMonth = effectiveEnd.getUTCMonth();
      for (
        let y = startYear, m = startMonth;
        y < endYear || (y === endYear && m <= endMonth);
        m === 11 ? (y++, (m = 0)) : m++
      ) {
        const occ = clampToMonthEnd(y, m, day);
        if (withinWindow(occ, effectiveStart, effectiveEnd)) {
          out.push({
            recurring_id: r.id,
            date: toIsoDate(occ),
            label: r.label,
            amount: r.amount,
            currency: r.currency,
            category: r.category,
          });
        }
      }
    } else if (r.cadence === 'weekly') {
      const dow = r.day_of_week ?? start.getUTCDay();
      const cursor = new Date(effectiveStart);
      // Advance cursor to the first matching day-of-week
      while (cursor.getUTCDay() !== dow) cursor.setUTCDate(cursor.getUTCDate() + 1);
      while (cursor.getTime() <= effectiveEnd.getTime()) {
        out.push({
          recurring_id: r.id,
          date: toIsoDate(cursor),
          label: r.label,
          amount: r.amount,
          currency: r.currency,
          category: r.category,
        });
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    } else if (r.cadence === 'yearly') {
      const month = (r.month_of_year ?? start.getUTCMonth() + 1) - 1;
      const day = r.day_of_month ?? start.getUTCDate();
      for (
        let y = effectiveStart.getUTCFullYear();
        y <= effectiveEnd.getUTCFullYear();
        y++
      ) {
        const occ = clampToMonthEnd(y, month, day);
        if (withinWindow(occ, effectiveStart, effectiveEnd)) {
          out.push({
            recurring_id: r.id,
            date: toIsoDate(occ),
            label: r.label,
            amount: r.amount,
            currency: r.currency,
            category: r.category,
          });
        }
      }
    }
    // 'custom' cadence: no auto-expansion; caller may add manual occurrences later
  }

  return out;
}

export function firstOfMonthIso(monthIso: string): string {
  // monthIso may be "YYYY-MM" or "YYYY-MM-DD"; we normalize to first of month
  const parts = monthIso.split('-');
  return `${parts[0]}-${parts[1]}-01`;
}

export function lastOfMonthIso(monthIso: string): string {
  const [yStr, mStr] = monthIso.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`;
}
