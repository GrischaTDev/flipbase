import { describe, expect, it } from 'vitest';
import { CLOTHING_SIZE_TABLES } from './clothing-size-catalog';
import {
  decodeSizeLabel,
  filterGuideTables,
  readMeasurementError,
  type GuideFilters,
  type GuideTable,
} from './clothing-size-guide';

const filters: GuideFilters = {
  category: '',
  audience: '',
  brand: '',
  query: '',
  measurements: {},
  tolerance: 1,
};
const reference: GuideTable = {
  id: 'example',
  title: 'Belegtes Modell',
  brand: 'Test',
  category: 'trousers',
  audience: 'women',
  kind: 'garment',
  columns: ['Größe'],
  notes: '',
  sourceTitle: 'Quelle',
  sourceUrl: 'https://example.org',
  reviewedAt: '2026-10-09',
  rows: [
    {
      id: 'xs',
      cells: ['XS'],
      labels: ['XS'],
      measurements: { waistFlat: { min: 32, max: 34 }, inseam: { min: 75, max: 77 } },
    },
    {
      id: 's',
      cells: ['S'],
      labels: ['S'],
      measurements: { waistFlat: { min: 34, max: 36 }, inseam: { min: 77, max: 79 } },
    },
  ],
};

describe('Labelangaben ohne universelle Konfektionsgröße', () => {
  it.each([
    ['W29/L35', 73.66, 88.9],
    ['29 × 31½', 73.66, 80.01],
    ['29 x 31 1/2', 73.66, 80.01],
    ['w23', 58.42, undefined],
    ['L31,5', undefined, 80.01],
  ])('liest %s als nominelle Inch-Angabe', (label, waist, inseam) => {
    const decoded = decodeSizeLabel(label);
    expect(decoded?.waistCm).toBe(waist);
    expect(decoded?.inseamCm).toBe(inseam);
    expect(decoded?.description).toContain('nominelle');
  });
  it.each(['3R', '30', '16W'])('erfindet bei %s keinen Kleidungsumfang', (label) => {
    expect(decodeSizeLabel(label)?.description).toBeTruthy();
    expect(decodeSizeLabel(label)?.waistCm).toBeUndefined();
  });
  it.each(['W0/L35', 'W29/L0', 'W999', 'W29/L35 kaputt', 'Marke 29', 'foo'])(
    'weist %s nicht als W/L aus',
    (label) => {
      expect(decodeSizeLabel(label)).toBeNull();
    },
  );
});

describe('Maßvergleich der vorhandenen Kleidung', () => {
  it.each([
    ['W22', 'nominal-waist'],
    ['L24', 'nominal-length'],
  ])('liest %s als einzelne Labelgröße trotz Größenbereich im Titel', (query, tableId) => {
    const entry = filterGuideTables(CLOTHING_SIZE_TABLES, { ...filters, query }).find(
      ({ table }) => table.id === tableId,
    );
    expect(entry?.rows.map((row) => row.cells[0])).toEqual([query]);
  });
  it('sucht S und XL als Größe statt als Teil eines Tabellentitels', () => {
    for (const query of ['S', 'XL']) {
      const entries = filterGuideTables(CLOTHING_SIZE_TABLES, { ...filters, query });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every(({ rows }) => rows.every((row) => row.labels.includes(query)))).toBe(
        true,
      );
    }
  });
  it('grenzt ein W/L-Paar innerhalb einer kombinierten Tabelle gemeinsam ein', () => {
    const entry = filterGuideTables(CLOTHING_SIZE_TABLES, { ...filters, query: 'W34/L32' }).find(
      ({ table }) => table.id === 'bonprix-men-trousers',
    );
    expect(entry?.rows.map((row) => row.cells[2])).toEqual(['34/32']);
  });
  it.each([
    ['EU 36', '36'],
    ['UK 8', '36'],
    ['US 4', '36'],
  ])('beachtet das Größensystem %s', (query, eu) => {
    const entry = filterGuideTables(CLOTHING_SIZE_TABLES, { ...filters, query }).find(
      ({ table }) => table.id === 'next-women-trousers',
    );
    expect(entry?.rows.map((row) => row.cells[0])).toEqual([eu]);
  });
  it('lässt ohne Suche alle Tabellen und Zeilen direkt sichtbar', () => {
    expect(filterGuideTables(CLOTHING_SIZE_TABLES, filters)).toHaveLength(
      CLOTHING_SIZE_TABLES.length,
    );
    expect(
      filterGuideTables(CLOTHING_SIZE_TABLES, filters).every(
        (entry) => !entry.matchedRowIds.length,
      ),
    ).toBe(true);
  });
  it('zeigt an einer gemeinsamen Maßgrenze beide Verkaufsgrößen', () => {
    const result = filterGuideTables([reference], {
      ...filters,
      tolerance: 0,
      measurements: { waistFlat: 34 },
    });
    expect(result[0]?.matchedRowIds).toEqual(['xs', 's']);
  });
  it('vergleicht alle eingegebenen Dimensionen gemeinsam', () => {
    const result = filterGuideTables([reference], {
      ...filters,
      tolerance: 0,
      measurements: { waistFlat: 34, inseam: 76 },
    });
    expect(result[0]?.matchedRowIds).toEqual(['xs']);
  });
  it('behauptet keinen vollständigen Treffer bei fehlendem Außenbein-Beleg', () => {
    expect(
      filterGuideTables([reference], { ...filters, measurements: { waistFlat: 34, outseam: 102 } }),
    ).toEqual([]);
  });
  it('wendet den gewählten Spielraum inklusiv auf die Maßgrenze an', () => {
    expect(
      filterGuideTables([reference], { ...filters, measurements: { waistFlat: 31 } })[0]
        ?.matchedRowIds,
    ).toEqual(['xs']);
    expect(
      filterGuideTables([reference], { ...filters, measurements: { waistFlat: 30.99 } }),
    ).toEqual([]);
  });
  it('nutzt Körpermaße und nominelle Inch nicht als Kleidungsmaßtreffer', () => {
    const lookup: GuideTable[] = ['body', 'conversion', 'length', 'special'].map((kind) => ({
      ...reference,
      id: kind,
      kind: kind as GuideTable['kind'],
    }));
    const result = filterGuideTables(lookup, { ...filters, measurements: { waistFlat: 34 } });
    expect(result).toHaveLength(4);
    expect(result.every((entry) => entry.matchedRowIds.length === 0)).toBe(true);
  });
  it('trennt Zielgruppe und Kleidungsart, nimmt passende Unisex-Belege mit', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      category: 'tops',
      audience: 'women',
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(({ table }) => table.category === 'tops' && table.audience !== 'men')).toBe(
      true,
    );
  });
  it('findet bei der kombinierten Labelsuche W- und L-Gegenstellungen', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, { ...filters, query: 'W29/L35' });
    expect(
      result.some(
        ({ table, rows }) =>
          table.id === 'nominal-waist' && rows.some((row) => row.cells[0] === 'W29'),
      ),
    ).toBe(true);
    expect(
      result.some(
        ({ table, rows }) =>
          table.id === 'nominal-length' && rows.some((row) => row.cells[0] === 'L35'),
      ),
    ).toBe(true);
    expect(result.some(({ table }) => table.id === 'silver-women')).toBe(true);
  });
  it('findet Refuge 3R und unterscheidet Zahl 3 von 33', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, { ...filters, query: '3R' });
    expect(result[0]?.table.id).toBe('refuge-women');
    expect(result[0]?.rows).toHaveLength(1);
    const numbers = filterGuideTables(CLOTHING_SIZE_TABLES, { ...filters, query: '3' });
    expect(numbers.find(({ table }) => table.id === 'nominal-waist')).toBeUndefined();
  });
  it.each([NaN, Infinity, -1, 0, 151])('weist ungültige Bundweite %s zurück', (waistFlat) => {
    expect(readMeasurementError({ ...filters, measurements: { waistFlat } })).toBeTruthy();
    expect(filterGuideTables([reference], { ...filters, measurements: { waistFlat } })).toEqual([]);
  });
  it.each([NaN, -1, 5.1])('weist ungültigen Suchspielraum %s zurück', (tolerance) => {
    expect(readMeasurementError({ ...filters, tolerance })).toBeTruthy();
  });
  it('erkennt widersprüchliche Beinlängen', () => {
    expect(
      readMeasurementError({ ...filters, measurements: { inseam: 100, outseam: 90 } }),
    ).toBeTruthy();
  });
});

describe('Nachvollziehbare recherchierte Datengrundlage', () => {
  it('hat eindeutige Zeilen, Quellen und konsistente Tabellen', () => {
    expect(new Set(CLOTHING_SIZE_TABLES.map((table) => table.id)).size).toBe(
      CLOTHING_SIZE_TABLES.length,
    );
    for (const table of CLOTHING_SIZE_TABLES) {
      expect(table.sourceUrl).toMatch(/^https:\/\//);
      expect(table.reviewedAt).toBe('2026-10-09');
      expect(table.rows.length).toBeGreaterThan(0);
      expect(new Set(table.rows.map((row) => row.id)).size).toBe(table.rows.length);
      for (const row of table.rows) {
        expect(row.cells).toHaveLength(table.columns.length);
        if (row.measurements) expect(table.kind).toBe('garment');
        for (const range of Object.values(row.measurements ?? {})) {
          expect(range.min).toBeGreaterThan(0);
          expect(range.max).toBeGreaterThanOrEqual(range.min);
        }
      }
    }
  });
  it('hält Hersteller-Körperreferenz W29 getrennt vom realen Jeansbund', () => {
    const silver = CLOTHING_SIZE_TABLES.find((table) => table.id === 'silver-women');
    expect(silver?.kind).toBe('body');
    expect(silver?.rows.find((row) => row.cells[0] === 'W29')?.cells[1]).toBe('6/8');
    const iron = CLOTHING_SIZE_TABLES.find((table) => table.id === 'iron-heart-jeans');
    const jeans29 = iron?.rows.find((row) => row.cells[0] === '29');
    expect(jeans29?.measurements?.waistFlat?.min).toBe(37.08);
  });
});
