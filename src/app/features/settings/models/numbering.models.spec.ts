import { describe, expect, it } from 'vitest';
import { defaultNumberSeries, previewNumberSeries } from './numbering.models';

describe('Nummernformatvorschau', () => {
  it('zeigt Mindestbreite ohne Abschneiden und verbraucht keinen Zustand', () => {
    const config = { ...defaultNumberSeries('purchase'), start_value: 99 };
    const now = new Date('2026-09-06T12:00:00Z');
    expect(previewNumberSeries(config, 'Europe/Berlin', now)).toEqual([
      'B 2026 99',
      'B 2026 100',
      'B 2026 101',
    ]);
    expect(config.start_value).toBe(99);
  });
  it('berücksichtigt die Workspace-Zeitzone an der Jahresgrenze', () => {
    const config = defaultNumberSeries('purchase');
    const now = new Date('2026-12-31T23:30:00Z');
    expect(previewNumberSeries(config, 'Europe/Berlin', now)[0]).toBe('B 2027 01');
    expect(previewNumberSeries(config, 'UTC', now)[0]).toBe('B 2026 01');
  });
  it('trennt Verkauf und Einkauf und unterstützt Formate ohne Jahr/Präfix', () => {
    expect(defaultNumberSeries('sale').prefix).toBe('V');
    expect(
      previewNumberSeries(
        { ...defaultNumberSeries('purchase'), prefix: '', include_year: false, separator: '-' },
        'UTC',
      ),
    ).toEqual(['01', '02', '03']);
  });
  it('weist ungültige Eingaben zurück', () => {
    expect(previewNumberSeries(defaultNumberSeries('purchase'), 'invalid/timezone')).toEqual([]);
    expect(
      previewNumberSeries({ ...defaultNumberSeries('purchase'), minimum_digits: 1.5 }, 'UTC'),
    ).toEqual([]);
    expect(
      previewNumberSeries({ ...defaultNumberSeries('purchase'), start_value: -1 }, 'UTC'),
    ).toEqual([]);
  });
});
