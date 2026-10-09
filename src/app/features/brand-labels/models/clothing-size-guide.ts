export type GuideAudience = 'women' | 'men' | 'unisex';
export type GuideCategory = 'trousers' | 'tops';
export type GuideKind = 'conversion' | 'garment' | 'body' | 'length' | 'special';
export type MeasureKey =
  'waistFlat' | 'hipFlat' | 'inseam' | 'outseam' | 'frontRise' | 'chestFlat' | 'backLength';
export interface MeasureRange {
  min: number;
  max: number;
}
export interface GuideRow {
  id: string;
  cells: readonly string[];
  labels: readonly string[];
  measurements?: Partial<Record<MeasureKey, MeasureRange>>;
}
export interface GuideTable {
  id: string;
  title: string;
  brand: string;
  category: GuideCategory;
  audience: GuideAudience;
  kind: GuideKind;
  columns: readonly string[];
  rows: readonly GuideRow[];
  notes: string;
  sourceTitle: string;
  sourceUrl: string;
  reviewedAt: string;
}
export interface GuideFilters {
  category: GuideCategory | '';
  audience: GuideAudience | '';
  brand: string;
  query: string;
  measurements: Partial<Record<MeasureKey, number | null>>;
  tolerance: number;
}
const measureNames: Record<MeasureKey, string> = {
  waistFlat: 'Bundweite',
  hipFlat: 'Hüftweite',
  inseam: 'Innenbeinlänge',
  outseam: 'Außenbeinlänge',
  frontRise: 'Leibhöhe',
  chestFlat: 'Brustweite',
  backLength: 'Rückenlänge',
};
function suppliedMeasurements(filters: GuideFilters): [MeasureKey, number][] {
  return Object.entries(filters.measurements).flatMap(([key, measurement]) =>
    measurement == null ? [] : [[key as MeasureKey, measurement]],
  );
}
export function readMeasurementError(filters: GuideFilters): string | null {
  if (!Number.isFinite(filters.tolerance) || filters.tolerance < 0 || filters.tolerance > 5)
    return 'Bitte gib einen Suchspielraum zwischen 0 und 5 cm ein.';
  for (const [key, measurement] of suppliedMeasurements(filters)) {
    const maximum = ['inseam', 'outseam', 'backLength'].includes(key) ? 200 : 150;
    if (!Number.isFinite(measurement) || measurement <= 0 || measurement > maximum)
      return `Bitte gib für ${measureNames[key]} einen Wert über 0 und bis ${maximum} cm ein.`;
  }
  const { inseam, outseam } = filters.measurements;
  if (inseam != null && outseam != null && inseam >= outseam)
    return 'Die Außenbeinlänge muss größer als die Innenbeinlänge sein.';
  return null;
}
function normalizeLabel(label: string): string {
  return label
    .toLocaleLowerCase('de')
    .replace(/½/g, '.5')
    .replace(/, /g, ' ')
    .replace(/,/g, '.')
    .trim();
}
function matchesQuery(table: GuideTable, row: GuideRow, query: string): boolean {
  if (!query) return true;
  const labels = row.labels.map(normalizeLabel);
  const countrySize = query.match(/^(eu|de|uk|us)\s*(\d+[a-z]*)$/);
  if (countrySize) {
    return table.columns.some((column, index) => {
      const systems = normalizeLabel(column).split(/[^a-z]+/);
      return (
        systems.includes(countrySize[1] ?? '') &&
        normalizeLabel(row.cells[index] ?? '')
          .split(/\s*\/\s*/)
          .includes(countrySize[2] ?? '')
      );
    });
  }
  if (/^\d+(?:\.\d+)?[a-z]*$/.test(query) || /^(xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl)$/.test(query))
    return labels.includes(query);
  const decoded = decodeSizeLabel(query);
  if (decoded?.waistCm != null || decoded?.inseamCm != null) {
    const waist = decoded.waistCm == null ? null : Math.round((decoded.waistCm / 2.54) * 100) / 100;
    const length =
      decoded.inseamCm == null ? null : Math.round((decoded.inseamCm / 2.54) * 100) / 100;
    const hasWaistLabels = labels.some((label) => /^w\d/.test(label));
    const hasLengthLabels = labels.some((label) => /^l\d/.test(label));
    const canCompareWaist = waist != null && hasWaistLabels;
    const canCompareLength = length != null && hasLengthLabels;
    return (
      (canCompareWaist || canCompareLength) &&
      (!canCompareWaist || labels.includes(`w${waist}`)) &&
      (!canCompareLength || labels.includes(`l${length}`))
    );
  }
  const heading = normalizeLabel(`${table.brand} ${table.title}`);
  if (heading.includes(query)) return true;
  return normalizeLabel([...row.cells, ...row.labels].join(' ')).includes(query);
}
export function filterGuideTables(
  tables: readonly GuideTable[],
  filters: GuideFilters,
): readonly { table: GuideTable; rows: readonly GuideRow[]; matchedRowIds: readonly string[] }[] {
  const measures = suppliedMeasurements(filters);
  const valid = !readMeasurementError(filters);
  const query = normalizeLabel(filters.query);
  return tables.flatMap((table) => {
    if (filters.category && table.category !== filters.category) return [];
    if (filters.audience && table.audience !== filters.audience && table.audience !== 'unisex')
      return [];
    if (filters.brand && table.brand !== filters.brand) return [];
    let rows = table.rows.filter((row) => matchesQuery(table, row, query));
    const matchedRowIds: string[] = [];
    if (measures.length && table.kind === 'garment') {
      rows = valid
        ? rows.filter((row) =>
            measures.every(([key, measurement]) => {
              const range = row.measurements?.[key];
              return (
                !!range &&
                measurement >= range.min - filters.tolerance - 1e-8 &&
                measurement <= range.max + filters.tolerance + 1e-8
              );
            }),
          )
        : [];
      matchedRowIds.push(...rows.map((row) => row.id));
    }
    return rows.length ? [{ table, rows, matchedRowIds }] : [];
  });
}
export function decodeSizeLabel(
  label: string,
): { title: string; description: string; waistCm?: number; inseamCm?: number } | null {
  const normalized = normalizeLabel(label).replace(/(\d)\s+1\/2/g, '$1.5');
  const numberPattern = '(\\d{1,2}(?:\\.\\d+)?)';
  const pair = normalized.match(
    new RegExp(`^w?\\s*${numberPattern}\\s*[x×/]\\s*l?\\s*${numberPattern}$`),
  );
  const single = normalized.match(new RegExp(`^([wl])\\s*${numberPattern}$`));
  const waist = pair ? Number(pair[1]) : single?.[1] === 'w' ? Number(single[2]) : undefined;
  const length = pair ? Number(pair[2]) : single?.[1] === 'l' ? Number(single[2]) : undefined;
  if (
    (waist != null && (waist < 18 || waist > 70)) ||
    (length != null && (length < 15 || length > 50))
  )
    return null;
  if (waist != null || length != null)
    return {
      title: 'Jeanslabel in Inch',
      description:
        'W bezeichnet die nominelle Bundgröße, L die Innenbeinlänge in Inch. 1 Inch = 2,54 cm. Der W-Wert ist keine Zusage zur tatsächlich gemessenen Bundweite; Marke, Schnitt und Tragezustand können abweichen.',
      ...(waist != null ? { waistCm: Math.round(waist * 254) / 100 } : {}),
      ...(length != null ? { inseamCm: Math.round(length * 254) / 100 } : {}),
    };
  if (/^\d+r$/.test(normalized))
    return {
      title: 'Zahl mit R-Zusatz',
      description:
        'Bei Refuge ordnest Du die Zahl über die markeneigene Damen-Jeans-Tabelle ein. Für R ist hier keine verlässliche historische Längenzuordnung belegt. Innenbeinlänge deshalb selbst messen.',
    };
  if (/^\d+w$/.test(normalized))
    return {
      title: 'W hinter der Zahl',
      description:
        'Ein nachgestelltes W kann eine US-Damen-Plusgröße kennzeichnen, etwa 16W. Das ist ein anderes System als ein vorangestelltes W bei Jeans. Prüfe die Markentabelle.',
    };
  if (/^\d+$/.test(normalized))
    return {
      title: 'Zahl ohne Größensystem',
      description:
        'Eine einzelne Zahl kann Jeans-Inch, EU/DE, UK, US oder eine markeneigene Größe bedeuten. Marke und weitere Etikettangaben sind für die Zuordnung nötig.',
    };
  return null;
}
