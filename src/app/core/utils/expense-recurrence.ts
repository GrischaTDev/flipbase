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

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateKey(value: string): CalendarDate {
  const match = DATE_KEY.exec(value);
  if (!match) throw new Error(`Ungültiges Kalenderdatum: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Ungültiges Kalenderdatum: ${value}`);
  }
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dateKey({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function frequencyMonths(frequency: ExpenseFrequency): number {
  switch (frequency) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'yearly':
      return 12;
  }
}

function occurrenceAt(start: CalendarDate, monthOffset: number): string {
  const zeroBasedMonth = start.month - 1 + monthOffset;
  const year = start.year + Math.floor(zeroBasedMonth / 12);
  const month = ((zeroBasedMonth % 12) + 12) % 12 + 1;
  const day = Math.min(start.day, daysInMonth(year, month));
  return dateKey({ year, month, day });
}

function afterEnd(rule: RecurrenceRule, occurrence: string): boolean {
  return rule.end_date !== null && occurrence > rule.end_date;
}

export function dueOccurrences(rule: RecurrenceRule, throughDate: string): string[] {
  if (!rule.is_active) return [];

  parseDateKey(throughDate);
  const start = parseDateKey(rule.start_date);
  if (rule.end_date !== null) parseDateKey(rule.end_date);
  if (rule.start_date > throughDate) return [];

  const step = frequencyMonths(rule.frequency);
  const result: string[] = [];

  for (let index = 0; ; index += 1) {
    const occurrence = occurrenceAt(start, index * step);
    if (occurrence > throughDate || afterEnd(rule, occurrence)) break;
    result.push(occurrence);
  }

  return result;
}

export function nextOccurrence(rule: RecurrenceRule, afterDate: string): string | null {
  if (!rule.is_active) return null;

  parseDateKey(afterDate);
  const start = parseDateKey(rule.start_date);
  if (rule.end_date !== null) parseDateKey(rule.end_date);
  const step = frequencyMonths(rule.frequency);

  for (let index = 0; ; index += 1) {
    const occurrence = occurrenceAt(start, index * step);
    if (afterEnd(rule, occurrence)) return null;
    if (occurrence > afterDate) return occurrence;
  }
}
