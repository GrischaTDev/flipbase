import { describe, expect, it } from 'vitest';
import { ExpenseRecurringRule } from '../models/expense.models';
import { dueOccurrences, nextOccurrence } from './expense-recurrence';

function rule(
  overrides: Partial<
    Pick<ExpenseRecurringRule, 'start_date' | 'end_date' | 'frequency' | 'is_active'>
  > = {},
): Pick<ExpenseRecurringRule, 'start_date' | 'end_date' | 'frequency' | 'is_active'> {
  return {
    start_date: '2026-01-15',
    end_date: null,
    frequency: 'monthly',
    is_active: true,
    ...overrides,
  };
}

describe('dueOccurrences', () => {
  it('materialisiert monatlich nur bis einschließlich Stichtag', () => {
    expect(dueOccurrences(rule(), '2026-04-14')).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ]);
  });

  it('behält bei Monatsenden den ursprünglichen Kalendertag als Anker', () => {
    expect(dueOccurrences(rule({ start_date: '2026-01-31' }), '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('unterstützt quartalsweise Wiederholungen', () => {
    expect(dueOccurrences(rule({ frequency: 'quarterly' }), '2026-10-15')).toEqual([
      '2026-01-15',
      '2026-04-15',
      '2026-07-15',
      '2026-10-15',
    ]);
  });

  it('behandelt den Schalttag bei jährlichen Regeln ohne Drift', () => {
    expect(
      dueOccurrences(rule({ start_date: '2024-02-29', frequency: 'yearly' }), '2028-02-29'),
    ).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('beachtet ein Enddatum einschließlich', () => {
    expect(dueOccurrences(rule({ end_date: '2026-03-15' }), '2026-12-31')).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ]);
  });

  it('liefert für inaktive Regeln keine Fälligkeiten', () => {
    expect(dueOccurrences(rule({ is_active: false }), '2026-12-31')).toEqual([]);
  });

  it('erzeugt keine Fälligkeit vor dem Startdatum', () => {
    expect(dueOccurrences(rule({ start_date: '2026-10-01' }), '2026-09-30')).toEqual([]);
  });
});

describe('nextOccurrence', () => {
  it('liefert die nächste Fälligkeit strikt nach dem Referenzdatum', () => {
    expect(nextOccurrence(rule(), '2026-02-15')).toBe('2026-03-15');
  });

  it('liefert nach dem Enddatum keine weitere Fälligkeit', () => {
    expect(nextOccurrence(rule({ end_date: '2026-03-15' }), '2026-03-15')).toBeNull();
  });
});
