import { describe, expect, it } from 'vitest';
import { dueOccurrences, nextOccurrence } from './expense-recurrence';

const rule = (
  overrides: Partial<{
    start_date: string;
    end_date: string | null;
    frequency: 'monthly' | 'quarterly' | 'yearly';
    is_active: boolean;
  }> = {},
) => ({
  start_date: '2026-01-15',
  end_date: null,
  frequency: 'monthly' as const,
  is_active: true,
  ...overrides,
});

describe('dueOccurrences', () => {
  it('erzeugt monatliche Fälligkeiten einschließlich Start und Stichtag', () => {
    expect(dueOccurrences(rule(), '2026-04-15')).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ]);
  });

  it('bleibt am ursprünglichen Monatstag verankert statt nach Februar zu driften', () => {
    expect(
      dueOccurrences(rule({ start_date: '2026-01-31' }), '2026-03-31'),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('behandelt Schalttage jährlich ohne dauerhaftes Driften', () => {
    expect(
      dueOccurrences(
        rule({ start_date: '2024-02-29', frequency: 'yearly' }),
        '2026-03-01',
      ),
    ).toEqual(['2024-02-29', '2025-02-28', '2026-02-28']);
  });

  it('unterstützt quartalsweise Fälligkeiten', () => {
    expect(
      dueOccurrences(
        rule({ start_date: '2026-01-31', frequency: 'quarterly' }),
        '2026-10-31',
      ),
    ).toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31']);
  });

  it('beachtet ein Enddatum einschließlich des letzten gültigen Termins', () => {
    expect(
      dueOccurrences(rule({ end_date: '2026-03-15' }), '2026-08-15'),
    ).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('erzeugt keine Termine für deaktivierte Regeln', () => {
    expect(dueOccurrences(rule({ is_active: false }), '2026-12-31')).toEqual([]);
  });

  it('erzeugt keine zukünftigen Termine nach dem Stichtag', () => {
    expect(dueOccurrences(rule(), '2026-02-14')).toEqual(['2026-01-15']);
  });
});

describe('nextOccurrence', () => {
  it('liefert den nächsten Termin strikt nach dem angegebenen Datum', () => {
    expect(nextOccurrence(rule(), '2026-02-15')).toBe('2026-03-15');
  });

  it('liefert null, wenn die Regel bereits beendet ist', () => {
    expect(nextOccurrence(rule({ end_date: '2026-02-15' }), '2026-02-15')).toBeNull();
  });
});
