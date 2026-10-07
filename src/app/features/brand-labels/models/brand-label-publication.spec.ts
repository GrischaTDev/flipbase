import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { createEmptyLabelContent } from './brand-label-content';
import type { LabelDraftInput } from './brand-label.models';
import {
  buildLabelPublicationSnapshot,
  getLabelPublicationIssues,
  LabelPublicationBlockedError,
  type LabelPublicationContext,
} from './brand-label-publication';

function input(): LabelDraftInput {
  return {
    content: {
      ...createEmptyLabelContent(), title: 'Dokumentiertes Testetikett', kinds: ['neck-label'],
      brandName: 'Vom Browser behauptete Marke', brandLineName: null,
      timeSummary: 'ca. 1980–1989', evidenceLevel: 'partially-supported',
      intervals: [{ startYear: 1980, endYear: 1989, sourceIds: ['s1'] }],
      features: ['Blauer Hintergrund'], checkHints: [{ text: 'Pflegeetikett vergleichen', sourceIds: ['s1'] }],
      limitations: ['Die Referenz bestätigt keine Echtheit.'], reviewedAt: '2026-10-05',
      sources: [{ id: 's1', title: 'Dokumentation zum Teststück', publisher: '',
        url: 'https://example.test/reference', accessedAt: '2026-10-04', locator: 'Abbildung 2' }],
    },
    images: [{ assetId: 10, position: 0, caption: 'Vorderseite', alt: 'Testetikett auf neutralem Grund', referenceItem: 'Teststück A' }],
  };
}
function context(): LabelPublicationContext {
  return {
    referenceId: 1, referenceBrandId: 2, referenceArchived: false,
    revisionState: 'review', version: 3, expectedVersion: 3, today: '2026-10-05',
    brand: { id: 2, name: 'Testmarke', archived: false }, brandLine: null,
    images: [{ assetId: 10, processingStatus: 'processed', permissionStatus: 'approved' }],
    visibleRelatedReferenceIds: [],
  };
}
function hasIssue(value: unknown, ctx: LabelPublicationContext, code: string, path?: string): void {
  assert.ok(getLabelPublicationIssues(value, ctx).some((issue) => issue.code === code && (!path || issue.path === path)), code);
}

describe('Veröffentlichungsprüfung ohne Vergabe von Rechten', () => {
  it('akzeptiert einen vollständigen, bereits zur Prüfung gespeicherten Entwurf', () => {
    assert.deepEqual(getLabelPublicationIssues(input(), context()), []);
  });
  it('liefert Strukturfehler ohne unsichere Eingabewerte auszugeben', () => {
    const value = { ...input(), service_role: 'geheim' };
    assert.deepEqual(getLabelPublicationIssues(value, context()), [{ code: 'invalid-input', path: 'draft' }]);
    assert.ok(!JSON.stringify(getLabelPublicationIssues(value, context())).includes('geheim'));
  });
  for (const state of ['draft', 'published', 'discarded'] as const) {
    it(`veröffentlicht den Zustand ${state} nicht`, () => {
      hasIssue(input(), { ...context(), revisionState: state }, 'review-required');
    });
  }
  it('sperrt einen veralteten Bearbeitungsstand', () => {
    hasIssue(input(), { ...context(), expectedVersion: 2 }, 'version-conflict');
  });
  for (const version of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    it(`akzeptiert keine ungültige Version ${String(version)}`, () => {
      hasIssue(input(), { ...context(), expectedVersion: version }, 'invalid-context');
    });
  }
  it('sperrt archivierte Referenzen', () => {
    hasIssue(input(), { ...context(), referenceArchived: true }, 'reference-archived');
  });
  it('sperrt archivierte Marken', () => {
    const ctx = context();
    hasIssue(input(), { ...ctx, brand: { ...ctx.brand, archived: true } }, 'brand-unavailable');
  });
  it('verwendet keine Metadaten einer anderen Marke', () => {
    hasIssue(input(), { ...context(), referenceBrandId: 99 }, 'brand-unavailable');
  });
  it('akzeptiert keinen leeren serverseitigen Markennamen', () => {
    const ctx = context();
    hasIssue(input(), { ...ctx, brand: { ...ctx.brand, name: '  ' } }, 'brand-unavailable');
  });
  for (const field of ['title', 'timeSummary'] as const) {
    it(`verlangt den Text ${field}`, () => {
      const value = input();
      hasIssue({ ...value, content: { ...value.content, [field]: '\t  \n' } }, context(), 'required-text', `content.${field}`);
    });
  }
  it('verlangt mindestens eine Labelart', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, kinds: [] } }, context(), 'kind-required');
  });
  it('verlangt ein sichtbares Erkennungsmerkmal', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, features: [] } }, context(), 'feature-required');
  });
  it('akzeptiert keinen leeren Eintrag zwischen Erkennungsmerkmalen', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, features: ['Blau', ' '] } }, context(), 'required-text', 'content.features[1]');
  });
  it('verlangt eine Prüfdatumsangabe', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, reviewedAt: null } }, context(), 'review-date-required');
  });
  it('behauptet keine in der Zukunft erfolgte Prüfung', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, reviewedAt: '2026-10-06' } }, context(), 'future-date');
  });
  it('liest keine globale Uhr, sondern nutzt den mitgelieferten Stichtag', () => {
    assert.deepEqual(getLabelPublicationIssues(input(), { ...context(), today: '2027-01-01' }), []);
  });
  it('weist einen ungültigen Stichtag zurück', () => {
    hasIssue(input(), { ...context(), today: '2026-02-30' }, 'invalid-context');
  });
});

describe('Belege und ehrliche Zeitangaben', () => {
  for (const field of ['title', 'url', 'locator'] as const) {
    it(`verlangt bei einer Quelle ${field}`, () => {
      const value = input();
      const source = value.content.sources[0]!;
      hasIssue({ ...value, content: { ...value.content, sources: [{ ...source, [field]: '' }] } }, context(), 'source-incomplete', `content.sources[0].${field}`);
    });
  }
  it('verlangt das Abrufdatum einer eingebundenen Quelle', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, sources: [{ ...value.content.sources[0]!, accessedAt: null }] } }, context(), 'source-incomplete');
  });
  it('akzeptiert keine Quellen aus der Zukunft', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, sources: [{ ...value.content.sources[0]!, accessedAt: '2026-10-06' }] } }, context(), 'future-date');
  });
  it('erzwingt keinen erfundenen Herausgeber', () => {
    assert.deepEqual(getLabelPublicationIssues(input(), context()), []);
  });
  it('verlangt einen Beleg pro Datierungsintervall', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, intervals: [{ startYear: 1980, endYear: 1989, sourceIds: [] }] } }, context(), 'interval-source-required');
  });
  it('verlangt einen Beleg für eine konkrete Prüfhilfe', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, checkHints: [{ text: 'Logo vergleichen', sourceIds: [] }] } }, context(), 'hint-source-required');
  });
  it('akzeptiert keine leere Prüfaussage', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, checkHints: [{ text: ' ', sourceIds: ['s1'] }] } }, context(), 'required-text', 'content.checkHints[0].text');
  });
  it('erlaubt ausdrücklich ungeklärte Zeiträume ohne erfundene Quellen', () => {
    const value = input();
    assert.deepEqual(getLabelPublicationIssues({ ...value, content: { ...value.content,
      evidenceLevel: 'undated', intervals: [], sources: [], checkHints: [],
      timeSummary: 'Zeitraum nicht sicher eingegrenzt', limitations: ['Keine belastbare Datierungsquelle vorhanden.'],
    } }, context()), []);
  });
  it('verlangt eine Einschränkung bei ungeklärter Datierung', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, evidenceLevel: 'undated', intervals: [], limitations: [] } }, context(), 'dating-explanation-required');
  });
  it('nennt einen numerischen Zeitraum nicht gleichzeitig vollständig undatiert', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, evidenceLevel: 'undated' } }, context(), 'dating-evidence-mismatch');
  });
  it('verlangt bei einer belegten Datierung wenigstens eine numerische Grenze', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, intervals: [] } }, context(), 'dating-evidence-mismatch');
  });
  it('erlaubt ein belegtes einseitig offenes Intervall', () => {
    const value = input();
    assert.deepEqual(getLabelPublicationIssues({ ...value, content: { ...value.content, intervals: [{ startYear: 1980, endYear: null, sourceIds: ['s1'] }] } }, context()), []);
  });
  it('erlaubt ausdrücklich unbekannte Grenzen, ohne sie numerisch zu erfinden', () => {
    const value = input();
    assert.deepEqual(getLabelPublicationIssues({ ...value, content: { ...value.content,
      evidenceLevel: 'undated', intervals: [{ startYear: null, endYear: null, sourceIds: [] }],
      limitations: ['Nicht datierbar.'],
    } }, context()), []);
  });
});

describe('Bilder, Markenlinien und verwandte Referenzen', () => {
  it('verlangt mindestens ein Bild', () => {
    hasIssue({ ...input(), images: [] }, context(), 'image-required');
  });
  it('verlangt aktuelle Metadaten zu jedem Bild', () => {
    hasIssue(input(), { ...context(), images: [] }, 'image-status-unavailable');
  });
  for (const processingStatus of ['pending', 'failed'] as const) {
    it(`sperrt ein Bild im Verarbeitungszustand ${processingStatus}`, () => {
      hasIssue(input(), { ...context(), images: [{ assetId: 10, processingStatus, permissionStatus: 'approved' }] }, 'image-not-processed');
    });
  }
  for (const permissionStatus of ['pending', 'revoked'] as const) {
    it(`sperrt ein Bild mit Freigabestand ${permissionStatus}`, () => {
      hasIssue(input(), { ...context(), images: [{ assetId: 10, processingStatus: 'processed', permissionStatus }] }, 'image-not-approved');
    });
  }
  it('ein freigegebenes Titelbild reicht nicht für ein ungeprüftes zweites Bild', () => {
    const value = input();
    const ctx = context();
    hasIssue({ ...value, images: [...value.images, { ...value.images[0]!, assetId: 11, position: 1 }] },
      { ...ctx, images: [...ctx.images, { assetId: 11, processingStatus: 'processed', permissionStatus: 'pending' }] },
      'image-not-approved', 'images[1]');
  });
  it('widersprüchliche Statuszeilen für dasselbe Bild werden nicht erraten', () => {
    const ctx = context();
    hasIssue(input(), { ...ctx, images: [...ctx.images, { ...ctx.images[0]!, permissionStatus: 'revoked' }] }, 'image-status-unavailable');
  });
  for (const field of ['caption', 'alt', 'referenceItem'] as const) {
    it(`verlangt die Bildbeschreibung ${field}`, () => {
      const value = input();
      hasIssue({ ...value, images: [{ ...value.images[0]!, [field]: ' ' }] }, context(), 'required-text', `images[0].${field}`);
    });
  }
  it('sperrt eine nicht mehr erreichbare verwandte Referenz', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, relatedReferenceIds: [22] } }, context(), 'related-reference-unavailable');
  });
  it('erlaubt einen Verweis auf eine aktuell sichtbare Referenz', () => {
    const value = input();
    assert.deepEqual(getLabelPublicationIssues({ ...value, content: { ...value.content, relatedReferenceIds: [22] } }, { ...context(), visibleRelatedReferenceIds: [22] }), []);
  });
  it('verlinkt eine Referenz nicht mit sich selbst', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, relatedReferenceIds: [1] } }, { ...context(), visibleRelatedReferenceIds: [1] }, 'related-reference-unavailable');
  });
  it('verlangt bei einer zugeordneten Markenlinie aktuelle Linienmetadaten', () => {
    const value = input();
    hasIssue({ ...value, content: { ...value.content, brandLineId: 3 } }, context(), 'brand-line-unavailable');
  });
  for (const line of [
    { id: 4, brandId: 2, name: 'Andere Linie', archived: false },
    { id: 3, brandId: 99, name: 'Fremde Marke', archived: false },
    { id: 3, brandId: 2, name: 'Archiviert', archived: true },
    { id: 3, brandId: 2, name: ' ', archived: false },
  ]) {
    it(`sperrt inkonsistente Linienmetadaten ${line.name}`, () => {
      const value = input();
      hasIssue({ ...value, content: { ...value.content, brandLineId: 3 } }, { ...context(), brandLine: line }, 'brand-line-unavailable');
    });
  }
});

describe('Unabhängiger Veröffentlichungssnapshot', () => {
  it('übernimmt den Markennamen aus dem Kontext, nicht aus dem Browsertext', () => {
    const value = input();
    const result = buildLabelPublicationSnapshot(value, context());
    assert.equal(result.content.brandName, 'Testmarke');
    assert.equal(value.content.brandName, 'Vom Browser behauptete Marke');
  });
  it('setzt den korrekten Markennamen und Liniennamen gemeinsam', () => {
    const value = input();
    const result = buildLabelPublicationSnapshot({ ...value, content: { ...value.content, brandLineId: 3, brandLineName: 'Falsch' } },
      { ...context(), brandLine: { id: 3, brandId: 2, name: 'Testlinie', archived: false } });
    assert.equal(result.content.brandLineName, 'Testlinie');
  });
  it('entfernt einen behaupteten Liniennamen ohne Linienzuordnung', () => {
    const value = input();
    const result = buildLabelPublicationSnapshot({ ...value, content: { ...value.content, brandLineName: 'Falsch' } }, context());
    assert.equal(result.content.brandLineName, null);
  });
  it('teilt keine veränderbaren Quellen, Intervalle oder Bilder mit dem Entwurf', () => {
    const value = input();
    const result = buildLabelPublicationSnapshot(value, context());
    assert.notEqual(result, value);
    assert.notEqual(result.content.sources[0], value.content.sources[0]);
    assert.notEqual(result.content.intervals[0]!.sourceIds, value.content.intervals[0]!.sourceIds);
    assert.notEqual(result.images[0], value.images[0]);
    assert.deepEqual(result.images, value.images);
  });
  it('verändert keinen eingefrorenen Entwurf', () => {
    const freeze = (value: unknown): void => {
      if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
      }
    };
    const value = input(); freeze(value);
    assert.equal(buildLabelPublicationSnapshot(value, context()).content.brandName, 'Testmarke');
  });
  it('erstellt bei gesperrter Freigabe keinen Snapshot', () => {
    assert.throws(() => buildLabelPublicationSnapshot(input(), { ...context(), expectedVersion: 1 }),
      (error: unknown) => error instanceof LabelPublicationBlockedError && error.issues.some((issue) => issue.code === 'version-conflict'));
  });
  it('verändert bei einem Fehler keinen vorherigen Snapshot', () => {
    const before = buildLabelPublicationSnapshot(input(), context());
    const copy = JSON.stringify(before);
    assert.throws(() => buildLabelPublicationSnapshot({ ...input(), images: [] }, context()));
    assert.equal(JSON.stringify(before), copy);
  });
});

describe('Grenzen des Freigabekontexts', () => {
  it('wertet unbekannte Verarbeitungszustände nicht als freigegeben', () => {
    const ctx = context();
    hasIssue(input(), { ...ctx, images: [{ ...ctx.images[0]!, processingStatus: 'unknown' }] } as unknown as LabelPublicationContext, 'invalid-context');
  });
  it('wertet unbekannte Freigabezustände nicht als Zustimmung', () => {
    const ctx = context();
    hasIssue(input(), { ...ctx, images: [{ ...ctx.images[0]!, permissionStatus: 'unknown' }] } as unknown as LabelPublicationContext, 'invalid-context');
  });
  it('führt keine Getter aus dem Kontext aus', () => {
    const ctx = context();
    let reads = 0;
    const untrusted = { ...ctx, get brand() { reads += 1; return ctx.brand; } };
    hasIssue(input(), untrusted, 'invalid-context');
    assert.equal(reads, 0);
  });
  it('verlangt echte boolesche Archivzustände', () => {
    hasIssue(input(), { ...context(), referenceArchived: 'false' } as unknown as LabelPublicationContext, 'invalid-context');
  });
  it('prüft die endgültige JSON-Größe nach Übernahme des Referenzmarkennamens', () => {
    const value = input();
    const draft = { ...value, content: { ...value.content, brandName: '',
      features: Array.from({ length: 50 }, () => 'a'.repeat(4000)),
      limitations: [...Array.from({ length: 15 }, () => 'b'.repeat(4000)), 'x'],
    } };
    const currentBytes = new TextEncoder().encode(JSON.stringify(draft)).byteLength;
    const padding = 262144 - currentBytes;
    assert.ok(padding >= 0 && padding < 4000);
    draft.content.limitations[15] = 'x'.repeat(padding + 1);
    assert.equal(new TextEncoder().encode(JSON.stringify(draft)).byteLength, 262144);
    hasIssue(draft, { ...context(), brand: { ...context().brand, name: 'L'.repeat(160) } }, 'invalid-input');
  });
});
