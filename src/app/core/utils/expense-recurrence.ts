import { ExpenseFrequency, ExpenseRecurringRule } from '../models/expense.models';

type RecurrenceRule = Pick<
  ExpenseRecurringRule,
  'start_date' | 'end_date' | 'frequency' | 'is_active'
>;

interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function parseDateKey(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;

  const maxDay = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDay) return null;
  return { year, month, day };
}

function dateKey(date: CalendarDate): string {
  return [
    String(date.year).padStart(4, '0'),
    String(date.month).padStart(2, '0'),
    String(date.day).padStart(2, '0'),
  ].join('-');
}

function monthsPerOccurrence(frequency: ExpenseFrequency): number {
  switch (frequency) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'yearly':
      return 12;
  }
}

function occurrenceAt(start: CalendarDate, frequency: ExpenseFrequency, index: number): string {
  const absoluteMonth =
    start.year * 12 + (start.month - 1) + monthsPerOccurrence(frequency) * index;
  const year = Math.floor(absoluteMonth / 12);
  const monthIndex = absoluteMonth % 12;
  const month = monthIndex + 1;
  const maxDay = new Date(year, month, 0).getDate();
  return dateKey({ year, month, day: Math.min(start.day, maxDay) });
}

export function dueOccurrences(rule: RecurrenceRule, throughDate: string): string[] {
  if (!rule.is_active) return [];

  const start = parseDateKey(rule.start_date);
  const through = parseDateKey(throughDate);
  if (!start || !through) return [];

  const throughKey = dateKey(through);
  const endKey = rule.end_date && parseDateKey(rule.end_date) ? rule.end_date : null;
  if (rule.start_date > throughKey || (endKey !== null && rule.start_date > endKey)) return [];

  const occurrences: string[] = [];
  for (let index = 0; index < 2400; index += 1) {
    const candidate = occurrenceAt(start, rule.frequency, index);
    if (candidate > throughKey || (endKey !== null && candidate > endKey)) break;
    occurrences.push(candidate);
  }
  return occurrences;
}

export function nextOccurrence(rule: RecurrenceRule, afterDate: string): string | null {
  if (!rule.is_active) return null;

  const start = parseDateKey(rule.start_date);
  const after = parseDateKey(afterDate);
  if (!start || !after) return null;

  const afterKey = dateKey(after);
  const endKey = rule.end_date && parseDateKey(rule.end_date) ? rule.end_date : null;

  for (let index = 0; index < 2400; index += 1) {
    const candidate = occurrenceAt(start, rule.frequency, index);
    if (endKey !== null && candidate > endKey) return null;
    if (candidate > afterKey) return candidate;
  }

  return null;
}
