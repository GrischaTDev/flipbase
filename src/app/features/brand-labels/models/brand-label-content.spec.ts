import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { createEmptyLabelContent, validateLabelContent } from './brand-label-content';
import { LabelValidationError } from './brand-label-validation';

function content() {
  return {
    ...createEmptyLabelContent(),
    title: 'Testetikett, keine echte Markenreferenz',
    sources: [
      {
        id: 's1',
        title: 'Synthetischer Beleg',
        publisher: 'Test',
        url: 'https://example.com/reference',
        accessedAt: '2024-02-29',
        locator: 'Teststelle',
      },
    ],
  };
}
function rejects(value: unknown, code: string) {
  assert.throws(
    () => validateLabelContent(value),
    (error: unknown) => error instanceof LabelValidationError && error.code === code,
  );
}

describe('Labelinhalt – Struktur und unveränderte Originalangaben', () => {
  it('erlaubt einen strukturell vollständigen, inhaltlich leeren Entwurf', () => {
    const value = createEmptyLabelContent();
    assert.deepEqual(validateLabelContent(value), value);
    assert.equal(value.evidenceLevel, 'undated');
    assert.equal(value.reviewedAt, null);
    assert.deepEqual(value.kinds, []);
  });
  it('erzeugt unabhängige leere Entwürfe', () => {
    const a = createEmptyLabelContent();
    const b = createEmptyLabelContent();
    assert.notEqual(a, b);
    assert.notEqual(a.sources, b.sources);
  });
  it('kopiert verschachtelte Daten statt unvalidierte Referenzen weiterzugeben', () => {
    const input = content();
    const output = validateLabelContent(input);
    assert.deepEqual(output, input);
    assert.notEqual(output.sources, input.sources);
    assert.notEqual(output.sources[0], input.sources[0]);
  });
  it('verändert Etiketttexte nicht automatisch', () => {
    const input = { ...content(), title: '  W33 / Size M – Étiquette  ' };
    assert.equal(validateLabelContent(input).title, input.title);
  });
  for (const value of [null, undefined, [], 'Nike', 123, true]) {
    it(`weist einen falschen Wurzeltyp zurück: ${String(value)}`, () =>
      rejects(value, 'invalid-object'));
  }
  it('weist unbekannte globale Schreib-/Rollenfelder zurück', () => {
    rejects({ ...content(), isOperator: true }, 'unknown-field');
  });
  it('weist fehlende Vertragsfelder zurück', () => {
    const { aliases: _unused, ...input } = content();
    rejects(input, 'missing-field');
  });
  it('führt keine Getter aus', () => {
    let read = false;
    const input = content();
    Object.defineProperty(input, 'title', {
      enumerable: true,
      get() {
        read = true;
        return 'x';
      },
    });
    rejects(input, 'invalid-object');
    assert.equal(read, false);
  });
  it('führt kein toJSON aus', () => {
    let called = false;
    const input = {
      ...content(),
      toJSON() {
        called = true;
        return {};
      },
    };
    rejects(input, 'unknown-field');
    assert.equal(called, false);
  });
  it('weist zusätzliche Symbolfelder zurück', () => {
    rejects({ ...content(), [Symbol('role')]: 'admin' }, 'unknown-field');
  });
  it('weist einen geerbten Sonderprototyp zurück', () => {
    rejects(Object.assign(Object.create({ role: 'admin' }), content()), 'invalid-object');
  });
  it('akzeptiert reine Objekte ohne Prototyp', () => {
    assert.deepEqual(
      validateLabelContent(Object.assign(Object.create(null), content())),
      content(),
    );
  });
  it('verweigert künstliche Löcher in Listen', () => {
    rejects({ ...content(), aliases: new Array(1) }, 'invalid-array');
  });
  it('verweigert zusätzliche Eigenschaften an Listen', () => {
    const aliases = Object.assign(['eins'], { role: 'admin' });
    rejects({ ...content(), aliases }, 'invalid-array');
  });
  it('meldet den konkreten Feldpfad ohne Rohdaten', () => {
    assert.throws(
      () => validateLabelContent({ ...content(), aliases: [42] }),
      (error: unknown) =>
        error instanceof LabelValidationError &&
        error.path === 'content.aliases[0]' &&
        !error.message.includes('42'),
    );
  });
});

describe('Labelinhalt – Text- und Mengengrenzen', () => {
  for (const [name, cap] of [
    ['title', 160],
    ['brandName', 160],
    ['timeSummary', 4000],
  ] as const) {
    it(`${name} akzeptiert die genaue Grenze`, () => {
      assert.equal(
        validateLabelContent({ ...content(), [name]: 'ä'.repeat(cap) })[name].length,
        cap,
      );
    });
    it(`${name} weist Grenze plus eins zurück`, () =>
      rejects({ ...content(), [name]: 'x'.repeat(cap + 1) }, 'text-too-long'));
  }
  it('zählt Unicode-Codepoints statt UTF-16-Einheiten', () => {
    assert.equal(
      validateLabelContent({ ...content(), title: '🧵'.repeat(160) }).title,
      '🧵'.repeat(160),
    );
    rejects({ ...content(), title: '🧵'.repeat(161) }, 'text-too-long');
  });
  for (const title of ['abc\u0000def', '\ud800', '\udfff']) {
    it('verweigert nicht in PostgreSQL-JSON übertragbare Textzeichen', () =>
      rejects({ ...content(), title }, 'invalid-text'));
  }
  it('erlaubt 20 Aliase und verweigert den 21.', () => {
    const aliases = Array.from({ length: 20 }, (_, i) => `Alias ${i}`);
    assert.equal(validateLabelContent({ ...content(), aliases }).aliases.length, 20);
    rejects({ ...content(), aliases: [...aliases, 'zu viel'] }, 'too-many-items');
  });
  it('begrenzt jeden Alias auf 80 Zeichen', () => {
    assert.equal(
      validateLabelContent({ ...content(), aliases: ['x'.repeat(80)] }).aliases[0]?.length,
      80,
    );
    rejects({ ...content(), aliases: ['x'.repeat(81)] }, 'text-too-long');
  });
  for (const field of ['features', 'limitations'] as const) {
    it(`${field} akzeptiert 50 und verweigert 51 Einträge`, () => {
      const values = Array.from({ length: 50 }, () => 'Hinweis');
      assert.equal(validateLabelContent({ ...content(), [field]: values })[field].length, 50);
      rejects({ ...content(), [field]: [...values, 'zu viel'] }, 'too-many-items');
    });
    it(`${field} akzeptiert Texte bis 4000 Zeichen`, () => {
      assert.equal(
        validateLabelContent({ ...content(), [field]: ['x'.repeat(4000)] })[field][0]?.length,
        4000,
      );
      rejects({ ...content(), [field]: ['x'.repeat(4001)] }, 'text-too-long');
    });
  }
  it('begrenzt auch das vollständige JSON in UTF-8-Bytes', () => {
    const input = { ...content(), features: Array.from({ length: 50 }, () => '🧵'.repeat(4000)) };
    rejects(input, 'payload-too-large');
  });
});

describe('Labelinhalt – Quellen und Zeiträume', () => {
  for (const kind of ['neck-label', 'care-size-label'] as const) {
    it(`akzeptiert die Labelart ${kind}`, () =>
      assert.deepEqual(validateLabelContent({ ...content(), kinds: [kind] }).kinds, [kind]));
  }
  it('verweigert unbekannte und doppelte Labelarten', () => {
    rejects({ ...content(), kinds: ['sneaker'] }, 'invalid-value');
    rejects({ ...content(), kinds: ['neck-label', 'neck-label'] }, 'duplicate-value');
  });
  for (const evidenceLevel of ['well-supported', 'partially-supported', 'undated'] as const) {
    it(`akzeptiert den Belegzustand ${evidenceLevel}`, () =>
      assert.equal(
        validateLabelContent({ ...content(), evidenceLevel }).evidenceLevel,
        evidenceLevel,
      ));
  }
  it('verweigert einen erfundenen Echtheitszustand', () =>
    rejects({ ...content(), evidenceLevel: 'authentic' }, 'invalid-value'));
  it('verweigert umgekehrte Intervalle', () =>
    rejects(
      { ...content(), intervals: [{ startYear: 1999, endYear: 1990, sourceIds: ['s1'] }] },
      'invalid-interval',
    ));
  for (const bounds of [
    [1990, 1990],
    [null, 1990],
    [1990, null],
    [null, null],
  ] as const) {
    it(`bewahrt gültige Intervallgrenzen ${bounds.join('/')}`, () => {
      const interval = { startYear: bounds[0], endYear: bounds[1], sourceIds: ['s1'] };
      assert.deepEqual(
        validateLabelContent({ ...content(), intervals: [interval] }).intervals[0],
        interval,
      );
    });
  }
  for (const startYear of [0, -1, 1990.5, '1990', NaN, Infinity, 10000]) {
    it(`verweigert eine ungültige Jahreszahl ${String(startYear)}`, () =>
      rejects(
        { ...content(), intervals: [{ startYear, endYear: null, sourceIds: [] }] },
        'invalid-year',
      ));
  }
  it('erlaubt unvollständige Quellenangaben nur als strukturellen Entwurf', () => {
    const source = { id: 's1', title: '', publisher: '', url: '', accessedAt: null, locator: '' };
    assert.deepEqual(validateLabelContent({ ...content(), sources: [source] }).sources[0], source);
  });
  for (const url of [
    'javascript:alert(1)',
    'http://example.com',
    '//example.com',
    'https:example.com',
    ' https://example.com',
    'https://user:secret@example.com',
    'https://exa\nmple.com',
  ]) {
    it(`verweigert unsichere Quellenadresse ${JSON.stringify(url)}`, () =>
      rejects({ ...content(), sources: [{ ...content().sources[0], url }] }, 'invalid-url'));
  }
  it('begrenzt Quellenadressen auf 2048 Zeichen', () => {
    const prefix = 'https://example.com/';
    const url = prefix + 'x'.repeat(2048 - prefix.length);
    assert.equal(
      validateLabelContent({ ...content(), sources: [{ ...content().sources[0], url }] }).sources[0]
        ?.url,
      url,
    );
    rejects(
      { ...content(), sources: [{ ...content().sources[0], url: url + 'x' }] },
      'text-too-long',
    );
  });
  it('verweigert doppelte Quellenkennungen', () =>
    rejects(
      { ...content(), sources: [content().sources[0], content().sources[0]] },
      'duplicate-source',
    ));
  it('verweigert eine fehlende Intervallquelle', () =>
    rejects(
      { ...content(), intervals: [{ startYear: 1990, endYear: null, sourceIds: ['missing'] }] },
      'unknown-source',
    ));
  it('verweigert eine fehlende Quelle einer Prüfaussage', () =>
    rejects(
      { ...content(), checkHints: [{ text: 'Vergleichen', sourceIds: ['missing'] }] },
      'unknown-source',
    ));
  it('weist zusätzliche Felder in Quellen zurück', () =>
    rejects(
      { ...content(), sources: [{ ...content().sources[0], privatePath: 'secret' }] },
      'unknown-field',
    ));
  it('weist zusätzliche Felder in Prüfhilfen zurück', () =>
    rejects(
      { ...content(), checkHints: [{ text: 'Vergleich', sourceIds: [], authentic: true }] },
      'unknown-field',
    ));
  it('verweigert doppelte Quellenzuordnungen', () =>
    rejects(
      { ...content(), checkHints: [{ text: 'Vergleich', sourceIds: ['s1', 's1'] }] },
      'duplicate-value',
    ));
  it('erlaubt 30 Intervalle, aber keine 31', () => {
    const intervals = Array.from({ length: 30 }, (_, i) => ({
      startYear: 1900 + i,
      endYear: null,
      sourceIds: ['s1'],
    }));
    assert.equal(validateLabelContent({ ...content(), intervals }).intervals.length, 30);
    rejects({ ...content(), intervals: [...intervals, intervals[0]] }, 'too-many-items');
  });
  it('erlaubt 100 Quellen, aber keine 101', () => {
    const sources = Array.from({ length: 100 }, (_, i) => ({
      ...content().sources[0],
      id: `s${i}`,
    }));
    assert.equal(validateLabelContent({ ...content(), sources }).sources.length, 100);
    rejects(
      { ...content(), sources: [...sources, { ...sources[0], id: 's100' }] },
      'too-many-items',
    );
  });
  it('erlaubt 50 Prüfhilfen, aber keine 51', () => {
    const checkHints = Array.from({ length: 50 }, () => ({ text: 'Vergleich', sourceIds: ['s1'] }));
    assert.equal(validateLabelContent({ ...content(), checkHints }).checkHints.length, 50);
    rejects({ ...content(), checkHints: [...checkHints, checkHints[0]] }, 'too-many-items');
  });
  for (const reviewedAt of [
    '2025-02-29',
    '2024-02-30',
    '2024-13-01',
    '2024-01-00',
    '2024-1-01',
    '0000-01-01',
    '2024-01-01T00:00:00Z',
  ]) {
    it(`verweigert ungültiges Kalenderdatum ${reviewedAt}`, () =>
      rejects({ ...content(), reviewedAt }, 'invalid-date'));
  }
  for (const reviewedAt of ['2000-02-29', '2024-02-29', '2026-10-05', null]) {
    it(`bewahrt gültiges Prüfdatum ${String(reviewedAt)}`, () =>
      assert.equal(validateLabelContent({ ...content(), reviewedAt }).reviewedAt, reviewedAt));
  }
  it('verweigert falsche Zugriffsdaten einer Quelle', () =>
    rejects(
      { ...content(), sources: [{ ...content().sources[0], accessedAt: '1900-02-29' }] },
      'invalid-date',
    ));
  it('akzeptiert positive Linien-/Referenzkennungen und null für keine Linie', () => {
    assert.equal(validateLabelContent({ ...content(), brandLineId: 1 }).brandLineId, 1);
    assert.deepEqual(
      validateLabelContent({ ...content(), relatedReferenceIds: [1, 2] }).relatedReferenceIds,
      [1, 2],
    );
  });
  for (const brandLineId of [0, -1, 1.1, '1', 2147483648]) {
    it(`verweigert ungültige Linienkennung ${String(brandLineId)}`, () =>
      rejects({ ...content(), brandLineId }, 'invalid-id'));
  }
  it('verweigert doppelte Verweise auf dieselbe Referenz', () =>
    rejects({ ...content(), relatedReferenceIds: [1, 1] }, 'duplicate-value'));
});

describe('Labelinhalt – exakte Nutzlastgrenze', () => {
  function sizedContent(bytes: number) {
    const value = {
      ...createEmptyLabelContent(),
      features: [] as string[],
      limitations: [] as string[],
    };
    // Erst genug zulässige Felder erzeugen, dann die abschließende ASCII-Länge anpassen.
    value.features = Array.from({ length: 50 }, () => 'x'.repeat(4000));
    value.limitations = Array.from({ length: 15 }, () => 'x'.repeat(4000));
    value.limitations.push('');
    const length = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    const missing = bytes - length;
    assert.ok(missing >= 0 && missing <= 4000, 'Testaufbau muss innerhalb der Feldgrenzen bleiben');
    value.limitations[value.limitations.length - 1] = 'x'.repeat(missing);
    assert.equal(new TextEncoder().encode(JSON.stringify(value)).byteLength, bytes);
    return value;
  }
  it('akzeptiert genau 262144 UTF-8-Bytes', () =>
    assert.deepEqual(validateLabelContent(sizedContent(262144)), sizedContent(262144)));
  it('verweigert genau 262145 UTF-8-Bytes', () =>
    rejects(sizedContent(262145), 'payload-too-large'));
});
