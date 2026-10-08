import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  normalizeLabelFilters,
  labelFiltersToQueryParams,
  intervalOverlapsDecade,
  hasDatedLabelInterval,
  matchesLabelTimeFilter,
} from './brand-label-filters';

const interval = (startYear: number | null, endYear: number | null) => ({
  startYear,
  endYear,
  sourceIds: [],
});

describe('Labelsuche – URL-Normalisierung', () => {
  it('erzeugt neutrale Filter ohne erfundene Marke', () => {
    assert.deepEqual(normalizeLabelFilters({}, 2026), {
      brandSlug: null,
      query: '',
      decade: null,
      kind: null,
    });
  });
  it('übernimmt gültige Filter', () => {
    assert.deepEqual(
      normalizeLabelFilters(
        { brand: 'nike', q: ' blue ', decade: '1990', kind: 'neck-label' },
        2026,
      ),
      { brandSlug: 'nike', query: 'blue', decade: 1990, kind: 'neck-label' },
    );
  });
  it('bewahrt den separaten Unbekannt-Filter', () =>
    assert.equal(normalizeLabelFilters({ decade: 'unknown' }, 2026).decade, 'unknown'));
  for (const decade of [
    '1989',
    '2021',
    '1890',
    '2030',
    '1990x',
    '1990.0',
    '1e3',
    '-1990',
    '01990',
    '',
    'Infinity',
  ]) {
    it(`normalisiert ungültiges Jahrzehnt ${JSON.stringify(decade)} auf alle Zeiträume`, () =>
      assert.equal(normalizeLabelFilters({ decade }, 2026).decade, null));
  }
  it('behandelt die Anfangs- und aktuelle Jahrzehntgrenze korrekt', () => {
    assert.equal(normalizeLabelFilters({ decade: '1900' }, 2026).decade, 1900);
    assert.equal(normalizeLabelFilters({ decade: '2020' }, 2026).decade, 2020);
    assert.equal(normalizeLabelFilters({ decade: '2030' }, 2030).decade, 2030);
  });
  it('liest keine globale Uhr für historische Filtertests', () =>
    assert.equal(normalizeLabelFilters({ decade: '2020' }, 2019).decade, null));
  it('behandelt ungültiges Kontextjahr sicher', () => {
    for (const year of [NaN, Infinity, 2026.5, -1]) {
      assert.throws(() => normalizeLabelFilters({}, year), RangeError);
    }
  });
  for (const brand of [
    '../nike',
    'nike/x',
    'Nike',
    '-nike',
    'nike-',
    'nike--line',
    'nike?x=1',
    'n'.repeat(81),
  ]) {
    it(`verweigert ungeeigneten URL-Slug ${JSON.stringify(brand)}`, () =>
      assert.equal(normalizeLabelFilters({ brand }, 2026).brandSlug, null));
  }
  it('akzeptiert schlichte, stabile Marken-Slugs', () =>
    assert.equal(normalizeLabelFilters({ brand: 'ralph-lauren' }, 2026).brandSlug, 'ralph-lauren'));
  it('normalisiert Unicode nach NFC und entfernt Rand-Leerzeichen', () =>
    assert.equal(normalizeLabelFilters({ q: '  Cafe\u0301  ' }, 2026).query, 'Café'));
  it('begrenzt Suchtexte auf 120 Unicode-Codepoints ohne halbe Zeichen', () =>
    assert.equal(normalizeLabelFilters({ q: '🧵'.repeat(121) }, 2026).query, '🧵'.repeat(120)));
  it('entfernt NUL, alleinstehende Surrogate und Steuerzeichen aus Suchparametern', () => {
    assert.equal(
      normalizeLabelFilters({ q: '\u0000\ud800hello\u0007\nworld\udfff' }, 2026).query,
      'hello world',
    );
  });
  for (const q of ['%', '_', ',()', "' OR 1=1 --", 'W33/W34', 'a+b&c=d', 'Adidas™']) {
    it(`bewahrt Suchtext wörtlich: ${q}`, () =>
      assert.equal(normalizeLabelFilters({ q }, 2026).query, q));
  }
  it('ignoriert eine unbekannte Labelart', () =>
    assert.equal(normalizeLabelFilters({ kind: 'shoe' }, 2026).kind, null));
  it('nimmt nur eigene URL-Parameter an', () => {
    const params = Object.create({ brand: 'nike', q: 'secret', decade: '1990' });
    assert.deepEqual(normalizeLabelFilters(params, 2026), normalizeLabelFilters({}, 2026));
  });
  it('erhält Filter auch beim echten URL-Encode/Decode-Rundlauf', () => {
    const original = normalizeLabelFilters(
      { brand: 'nike', q: '% + & Café 🧵', decade: 'unknown', kind: 'care-size-label' },
      2026,
    );
    const query = new URLSearchParams(labelFiltersToQueryParams(original));
    const parsed = Object.fromEntries(new URLSearchParams(query.toString()));
    assert.deepEqual(normalizeLabelFilters(parsed, 2026), original);
  });
  it('schreibt keine leeren URL-Parameter', () =>
    assert.deepEqual(labelFiltersToQueryParams(normalizeLabelFilters({}, 2026)), {}));
  it('ist stabil, damit Zurücknavigation keine Normalisierungsschleife erzeugt', () => {
    const first = normalizeLabelFilters(
      { q: '  Cafe\u0301  ', brand: 'bad/slug', decade: '1990x', kind: 'bad' },
      2026,
    );
    const second = normalizeLabelFilters(labelFiltersToQueryParams(first), 2026);
    assert.deepEqual(second, first);
  });
});

describe('Labelzeitraum – echte Überschneidungen statt erfundener Datierung', () => {
  const cases: [number | null, number | null, number, boolean][] = [
    [1980, 1989, 1990, false],
    [1989, 1990, 1990, true],
    [1999, 1999, 1990, true],
    [2000, 2009, 1990, false],
    [null, 1989, 1990, false],
    [null, 1990, 1990, true],
    [2000, null, 1990, false],
    [1990, null, 1990, true],
    [null, null, 1990, false],
    [1999, 1990, 1990, false],
  ];
  for (const [start, end, decade, expected] of cases) {
    it(`${start}/${end} überlappt ${decade}: ${expected}`, () =>
      assert.equal(intervalOverlapsDecade(interval(start, end), decade), expected));
  }
  it('füllt keine unbelegten Lücken zwischen mehreren Intervallen', () => {
    const intervals = [interval(1980, 1989), interval(2000, 2009)];
    assert.equal(matchesLabelTimeFilter(intervals, 1990), false);
    assert.equal(matchesLabelTimeFilter(intervals, 1980), true);
    assert.equal(matchesLabelTimeFilter(intervals, 2000), true);
  });
  it('ordnet nur vollständig ungeklärte Einträge dem Unbekannt-Filter zu', () => {
    assert.equal(matchesLabelTimeFilter([], 'unknown'), true);
    assert.equal(matchesLabelTimeFilter([interval(null, null)], 'unknown'), true);
    assert.equal(matchesLabelTimeFilter([interval(null, 1990)], 'unknown'), false);
    assert.equal(
      matchesLabelTimeFilter([interval(null, null), interval(1990, 1999)], 'unknown'),
      false,
    );
  });
  it('behält undatierte Einträge bei allen Zeiträumen', () =>
    assert.equal(matchesLabelTimeFilter([], null), true));
  it('erkennt mindestens eine gültige numerische Grenze', () => {
    assert.equal(hasDatedLabelInterval(interval(null, null)), false);
    assert.equal(hasDatedLabelInterval(interval(null, 1990)), true);
    assert.equal(hasDatedLabelInterval(interval(1990, null)), true);
  });
  it('behandelt ungültige Zahlen auch bei einem direkten Funktionsaufruf defensiv', () => {
    assert.equal(intervalOverlapsDecade(interval(NaN, null), 1990), false);
    assert.equal(intervalOverlapsDecade(interval(1990, null), 1991), false);
    assert.equal(intervalOverlapsDecade(interval(1990, null), Infinity), false);
  });
});

describe('Labelsuche – abgeschnittene Leerzeichen bleiben stabil', () => {
  it('normalisiert ein Leerzeichen am Abschneidepunkt nur einmal', () => {
    const first = normalizeLabelFilters({ q: 'x'.repeat(119) + ' y' }, 2026);
    const second = normalizeLabelFilters(labelFiltersToQueryParams(first), 2026);
    assert.equal(first.query, 'x'.repeat(119));
    assert.deepEqual(first, second);
  });
});
