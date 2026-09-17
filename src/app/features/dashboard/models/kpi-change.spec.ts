import { describe, expect, it } from 'vitest';
import { kpiChange, KpiChangeInput } from './kpi-change';

const base: KpiChangeInput = {
  current: 112,
  previous: 100,
  format: 'percent',
  comparisonLabel: '01.–17.08.',
  colored: true,
};

describe('kpiChange', () => {
  it('zeigt einen Anstieg als gerundete Prozentangabe mit Symbol und Satz', () => {
    expect(kpiChange(base)).toEqual({
      text: '▲ 12 %',
      tone: 'success',
      description: 'gestiegen um 12 Prozent gegenüber 01.–17.08.',
    });
  });

  it('bezieht einen Rückgang auf den Betrag des Vorwerts, auch bei Verlusten', () => {
    expect(kpiChange({ ...base, current: -30, previous: -20 })).toEqual({
      text: '▼ 50 %',
      tone: 'critical',
      description: 'gesunken um 50 Prozent gegenüber 01.–17.08.',
    });
  });

  it('färbt Ausgaben und andere neutrale Kennzahlen nicht ein', () => {
    expect(kpiChange({ ...base, colored: false })?.tone).toBe('neutral');
  });

  it('meldet einen Wert nach einem Vorwert von 0 als neu', () => {
    expect(kpiChange({ ...base, current: 5, previous: 0 })).toEqual({
      text: 'neu',
      tone: 'success',
      description: 'neu gegenüber 01.–17.08., vorher 0',
    });
  });

  it.each([
    [0, 0],
    [100.2, 100],
  ])('zeigt %s gegenüber %s als unverändert', (current, previous) => {
    expect(kpiChange({ ...base, current, previous })).toEqual({
      text: '±0 %',
      tone: 'neutral',
      description: 'unverändert gegenüber 01.–17.08.',
    });
  });

  it('vergleicht Margen in Prozentpunkten', () => {
    expect(
      kpiChange({ ...base, current: 48.4, previous: 45.2, format: 'points', colored: false }),
    ).toEqual({
      text: '▲ 3,2 Pp.',
      tone: 'neutral',
      description: 'gestiegen um 3,2 Prozentpunkte gegenüber 01.–17.08.',
    });
  });

  it.each([
    [null, 10],
    [10, null],
  ])('liefert ohne beide Werte (%s, %s) keinen Vergleich', (current, previous) => {
    expect(kpiChange({ ...base, current, previous })).toBeNull();
  });
});
