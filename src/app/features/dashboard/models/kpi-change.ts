export type KpiChangeFormat = 'percent' | 'points';
export type KpiChangeTone = 'success' | 'critical' | 'neutral';

export interface KpiChange {
  /** Sichtbare Kurzform, z. B. „▲ 12 %“, „neu“ oder „±0 %“. */
  readonly text: string;
  readonly tone: KpiChangeTone;
  /** Vollständiger Satz für Screenreader. */
  readonly description: string;
}

export interface KpiChangeInput {
  readonly current: number | null;
  readonly previous: number | null;
  readonly format: KpiChangeFormat;
  /** Beschriftung des Vergleichszeitraums, z. B. „gestern“. */
  readonly comparisonLabel: string;
  /** Nur Gewinn und Umsatz färben Anstieg und Rückgang ein. */
  readonly colored: boolean;
}

const decimal = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Veränderung gegenüber dem Vergleichszeitraum. Ohne einen der beiden Werte
 * gibt es keinen belastbaren Vergleich.
 */
export function kpiChange(input: KpiChangeInput): KpiChange | null {
  const { current, previous, format, comparisonLabel, colored } = input;
  if (current === null || previous === null) return null;
  const against = `gegenüber ${comparisonLabel}`;

  if (format === 'points') {
    const difference = Math.round((current - previous) * 10) / 10;
    if (difference === 0) {
      return { text: '±0 Pp.', tone: 'neutral', description: `unverändert ${against}` };
    }
    const amount = decimal.format(Math.abs(difference));
    return change(difference > 0, `${amount} Pp.`, `${amount} Prozentpunkte ${against}`, colored);
  }

  if (previous === 0) {
    if (current === 0) {
      return { text: '±0 %', tone: 'neutral', description: `unverändert ${against}` };
    }
    return {
      text: 'neu',
      tone: tone(current > 0, colored),
      description: `neu ${against}, vorher 0`,
    };
  }

  const percent = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (percent === 0) {
    return { text: '±0 %', tone: 'neutral', description: `unverändert ${against}` };
  }
  const amount = Math.abs(percent);
  return change(percent > 0, `${amount} %`, `${amount} Prozent ${against}`, colored);
}

function change(rising: boolean, amount: string, spoken: string, colored: boolean): KpiChange {
  return {
    text: `${rising ? '▲' : '▼'} ${amount}`,
    tone: tone(rising, colored),
    description: `${rising ? 'gestiegen um' : 'gesunken um'} ${spoken}`,
  };
}

function tone(rising: boolean, colored: boolean): KpiChangeTone {
  if (!colored) return 'neutral';
  return rising ? 'success' : 'critical';
}
