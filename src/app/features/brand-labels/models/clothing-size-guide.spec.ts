import { describe, expect, it } from 'vitest';
import { CLOTHING_SIZE_TABLES } from './clothing-size-catalog';
import { collectTrouserMeasurementRanges } from './clothing-trouser-measurements';
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
  title: 'Richtgrößen',
  brand: 'Test',
  category: 'trousers',
  audience: 'women',
  kind: 'orientation',
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
  it.each(['UK 32', 'US 34'])('ordnet %s innerhalb der Herren-Jeansreihe ein', (query) => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      category: 'trousers',
      audience: 'men',
      query,
    });
    expect(
      result
        .find(({ table }) => table.id === 'general-men-trousers')
        ?.rows.map((row) => row.cells[0]),
    ).toEqual(['M']);
  });
  it('ordnet 42 cm Herrenbund als M ein und vergleicht die Beinlänge separat', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      category: 'trousers',
      audience: 'men',
      tolerance: 0,
      measurements: { waistFlat: 42, inseam: 81.28, outseam: 104 },
    });
    expect(result.find(({ table }) => table.id === 'general-men-trousers')?.matchedRowIds).toEqual([
      'men-M',
    ]);
    expect(result.find(({ table }) => table.id === 'nominal-length')?.matchedRowIds).toEqual([
      'length-32',
    ]);
  });
  it('ordnet 35 cm Damenbund als S ein, ohne ein einzelnes Hosenmodell', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      category: 'trousers',
      audience: 'women',
      tolerance: 0,
      measurements: { waistFlat: 35 },
    });
    expect(
      result.find(({ table }) => table.id === 'general-women-trousers')?.matchedRowIds,
    ).toEqual(['women-S']);
  });
  it('behauptet mit einer Innenbeinlänge allein keine XS/M-Schätzung', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      measurements: { inseam: 81.28 },
    });
    expect(
      result
        .filter(({ table }) => table.kind === 'orientation')
        .every((entry) => entry.matchedRowIds.length === 0),
    ).toBe(true);
    expect(
      result.find(({ table }) => table.id === 'nominal-length')?.matchedRowIds.length,
    ).toBeGreaterThan(0);
  });
  it.each(['M', 'W29', 'EU 36'])(
    'ermittelt die Beinlänge unabhängig vom Weitenlabel %s',
    (query) => {
      const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
        ...filters,
        query,
        tolerance: 0,
        measurements: { inseam: 88.9 },
      });
      expect(
        result.find(({ table }) => table.id === 'nominal-length')?.rows.map((row) => row.cells[0]),
      ).toEqual(['L35']);
    },
  );
  it('behält ein ausdrücklich gesuchtes L-Label beim Maßvergleich bei', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      query: 'L32',
      tolerance: 0,
      measurements: { inseam: 88.9 },
    });
    expect(result.find(({ table }) => table.id === 'nominal-length')).toBeUndefined();
  });
  it.each([
    ['XXL', '2XL'],
    ['XXXL', '3XL'],
  ])('erkennt %s und %s als dieselbe Größenangabe', (first, second) => {
    const search = (query: string) =>
      filterGuideTables(CLOTHING_SIZE_TABLES, { ...filters, query }).flatMap(({ table, rows }) =>
        rows.map((row) => `${table.id}:${row.id}`),
      );
    expect(search(first).length).toBeGreaterThan(0);
    expect(search(first)).toEqual(search(second));
  });
  it('vergleicht Brustweiten mit einer Größen-Spanne', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      category: 'tops',
      tolerance: 0,
      measurements: { chestFlat: 52 },
    });
    expect(result.find(({ table }) => table.id === 'general-unisex-tops')?.matchedRowIds).toEqual([
      'tops-M',
    ]);
  });
  it('verwendet sichtbare gerundete Bundgrenzen auch beim Vergleich', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      category: 'trousers',
      audience: 'men',
      tolerance: 0,
      measurements: { waistFlat: 43.8 },
    });
    expect(
      result.find(({ table }) => table.id === 'general-men-trousers')?.matchedRowIds,
    ).toContain('men-M');
  });
  it('verwendet sichtbare gerundete Brustgrenzen auch beim Vergleich', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      category: 'tops',
      tolerance: 0,
      measurements: { chestFlat: 40.6 },
    });
    expect(result.find(({ table }) => table.id === 'general-unisex-tops')?.matchedRowIds).toEqual([
      'tops-XS',
    ]);
  });
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
      expect(
        entries
          .filter(({ table }) => table.kind !== 'length-reference')
          .every(({ rows }) => rows.every((row) => row.labels.includes(query))),
      ).toBe(true);
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
  it('behandelt Außenbeinlänge als Zusatzangabe statt als Weitengröße', () => {
    expect(
      filterGuideTables([reference], {
        ...filters,
        measurements: { waistFlat: 34, outseam: 102 },
      })[0]?.matchedRowIds,
    ).toEqual(['xs', 's']);
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
    const lookup: GuideTable[] = ['body', 'conversion', 'special'].map((kind) => ({
      ...reference,
      id: kind,
      kind: kind as GuideTable['kind'],
    }));
    const result = filterGuideTables(lookup, { ...filters, measurements: { waistFlat: 34 } });
    expect(result).toHaveLength(3);
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
  it('zeigt Innenbein, Außenbein und Leibhöhe direkt neben der flachen Bundweite', () => {
    for (const audience of ['women', 'men']) {
      const table = CLOTHING_SIZE_TABLES.find(
        (table) => table.id === `general-${audience}-trousers`,
      );
      expect(table?.columns.slice(-3)).toEqual([
        'Innenbein, Beispiele (cm)',
        'Außenbein inkl. Bund, Beispiele (cm)',
        'Leibhöhe vorne, Beispiele (cm)',
      ]);
      expect(table?.rows.find((row) => row.cells[0] === 'M')?.cells.slice(-3)).toEqual(
        audience === 'women'
          ? ['≈ 76,4–78,2', '≈ 107–111,2', '≈ 27,5–33,1']
          : ['≈ 76,3–79,9', '≈ 105–111,5', '≈ 25,8–36,5'],
      );
    }
  });
  it('interpoliert keine fehlenden Kleidungsmaße oder Innenbeine aus Außenbein und Leibhöhe', () => {
    expect(collectTrouserMeasurementRanges('women', 'XXXL')).toEqual({});
    expect(collectTrouserMeasurementRanges('men', 'XXS')).toEqual({});
    expect(collectTrouserMeasurementRanges('men', 'XS')).toEqual({
      outseam: { min: 101, max: 103 },
      frontRise: { min: 27.5, max: 27.5 },
    });
    expect(collectTrouserMeasurementRanges('women', 'S').outseam).toEqual({
      min: 106.2,
      max: 110.6,
    });
  });
  it('übernimmt belegte Randgrößen ohne fehlende Innenbeinwerte zu erfinden', () => {
    expect(collectTrouserMeasurementRanges('women', 'XXS')).toEqual({
      inseam: { min: 76.1, max: 76.1 },
      outseam: { min: 109.4, max: 109.4 },
      frontRise: { min: 31.3, max: 31.3 },
    });
    expect(collectTrouserMeasurementRanges('women', 'XXL')).toEqual({
      inseam: { min: 76.3, max: 76.3 },
      outseam: { min: 113, max: 113 },
      frontRise: { min: 35.5, max: 35.5 },
    });
    expect(collectTrouserMeasurementRanges('men', 'XXL')).toEqual({
      inseam: { min: 79.9, max: 79.9 },
      outseam: { min: 110.5, max: 113 },
      frontRise: { min: 29.3, max: 32.5 },
    });
  });
  it.each([90, 105, 125])(
    'verändert die Weitenschätzung nicht durch %s cm Außenbein',
    (outseam) => {
      const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
        ...filters,
        category: 'trousers',
        audience: 'men',
        tolerance: 0,
        measurements: { waistFlat: 42, outseam },
      });
      const general = result.find(({ table }) => table.id === 'general-men-trousers');
      expect(general?.rows.map((row) => row.cells[0])).toEqual(['M']);
      expect(general?.matchedRowIds).toEqual(['men-M']);
    },
  );
  it('enthält flache Bundweiten ohne eine zusätzliche Umfangsspalte', () => {
    const tables = CLOTHING_SIZE_TABLES.filter(
      (table) => table.id.startsWith('general-') && table.category === 'trousers',
    );
    expect(
      tables.every((table) => table.columns.some((column) => column.includes('Bundweite flach'))),
    ).toBe(true);
    expect(
      tables.every((table) => table.columns.every((column) => !column.includes('Bundumfang'))),
    ).toBe(true);
  });
  it.each(['M', 'S', 'EU 50'])(
    'hält Längenreferenzen bei einer Weitensuche nach %s sichtbar',
    (query) => {
      const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
        ...filters,
        query,
        category: 'trousers',
        audience: 'men',
      });
      expect(result.some(({ table }) => table.id === 'bonprix-men-lengths')).toBe(true);
      expect(result.find(({ table }) => table.id === 'bonprix-men-lengths')?.matchedRowIds).toEqual(
        [],
      );
    },
  );
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
        if (row.measurements) expect(['orientation', 'length']).toContain(table.kind);
        for (const range of Object.values(row.measurements ?? {})) {
          expect(range.min).toBeGreaterThan(0);
          expect(range.max).toBeGreaterThanOrEqual(range.min);
        }
      }
    }
  });
  it('hält Körperreferenzen getrennt von redaktionellen Richtbereichen', () => {
    const silver = CLOTHING_SIZE_TABLES.find((table) => table.id === 'silver-women');
    expect(silver?.kind).toBe('body');
    expect(silver?.rows.find((row) => row.cells[0] === 'W29')?.cells[1]).toBe('6/8');
    const general = CLOTHING_SIZE_TABLES.find((table) => table.id === 'general-men-trousers');
    expect(general?.kind).toBe('orientation');
    expect(general?.rows.find((row) => row.cells[0] === 'M')?.measurements?.waistFlat).toEqual({
      min: 40,
      max: 43.8,
    });
    expect(
      CLOTHING_SIZE_TABLES.some((table) =>
        ['iron-heart-jeans', 'lands-end-yoga', 'cottonmill-sweatpants', 'port-co-tshirt'].includes(
          table.id,
        ),
      ),
    ).toBe(false);
  });
});

describe('Kinderlabels und Körpergrößen', () => {
  it.each(['tops', 'trousers'] as const)(
    'findet Nike YM für %s und schließt Erwachsenengrößen aus',
    (category) => {
      const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
        ...filters,
        category,
        audience: 'children',
        query: 'YM',
      });
      expect(result.length).toBeGreaterThan(0);
      expect(
        result.every(
          ({ table, rows }) =>
            table.audience === 'children' && rows.every((row) => row.cells[0] === 'M'),
        ),
      ).toBe(true);
    },
  );
  it('unterscheidet Nike Jungen-M von Mädchen-M am Bereich 147 cm', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      audience: 'children',
      brand: 'Nike',
      query: 'M/147',
    });
    expect(result.map(({ table }) => table.id)).toEqual(['nike-boys']);
  });
  it('unterscheidet adidas US-M und Nike-M bei 150 cm', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      audience: 'children',
      query: 'M/150',
    });
    expect(result.some(({ table }) => table.id === 'adidas-children-us')).toBe(true);
    expect(result.some(({ table }) => table.id === 'nike-boys')).toBe(false);
  });
  it('lässt ein regionales Nike-Label 160 zwischen L und XL mehrdeutig', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      audience: 'children',
      category: 'tops',
      brand: 'Nike',
      query: '160',
    });
    expect(
      result
        .find(({ table }) => table.id === 'nike-children-cn-tops')
        ?.rows.map((row) => row.cells[0]),
    ).toEqual(['L', 'XL']);
  });
  it('erkennt das vollständige CN-Hosenlabel 160/69 ohne eine W/L-Umrechnung', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      audience: 'children',
      category: 'trousers',
      brand: 'Nike',
      query: '160/69',
    });
    expect(
      result
        .find(({ table }) => table.id === 'nike-children-cn-trousers')
        ?.rows.map((row) => row.cells[0]),
    ).toEqual(['XL']);
    expect(decodeSizeLabel('160/69')).toBeNull();
  });
  it('verwendet Kinder-Körpergrößen niemals als Kleidungsmaßtreffer', () => {
    const result = filterGuideTables(CLOTHING_SIZE_TABLES, {
      ...filters,
      audience: 'children',
      measurements: { waistFlat: 36, inseam: 81.28 },
    });
    const children = result.filter(({ table }) => table.audience === 'children');
    expect(children.length).toBeGreaterThan(0);
    expect(children.every(({ matchedRowIds }) => matchedRowIds.length === 0)).toBe(true);
    expect(result.every(({ table }) => table.kind !== 'orientation')).toBe(true);
  });
});
