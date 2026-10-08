import { describe, expect, it } from 'vitest';
import { createEmptyLabelContent } from './brand-label-content';
import {
  prepareAdminCommand,
  prepareReaderCommand,
  readReaderReceipt,
  readAdminDraft,
  readAdminPage,
  readAdminReference,
} from './brand-label-admin';
const draft = {
  referenceId: 1,
  revisionId: 10,
  version: 1,
  state: 'draft',
  input: { content: createEmptyLabelContent(), images: [] },
};
const base = {
  referenceId: 1,
  slug: null,
  brandId: 2,
  brandName: 'Testmarke',
  brandSlug: 'testmarke',
  brandArchived: false,
  version: 1,
  archived: false,
};
const row = {
  ...base,
  title: 'Testlabel',
  state: 'draft',
  draftRevisionId: 10,
  draftVersion: 1,
  publishedRevisionId: null,
};
describe('Labelredaktion: Lese- und Auftragsvertrag', () => {
  it('behält Entwurf und Veröffentlichung getrennt und kopiert Inhalte', () => {
    const source = { ...base, draft, publication: { ...draft, state: 'published', revisionId: 9 } };
    const result = readAdminReference(source);
    expect(result?.draft?.revisionId).toBe(10);
    expect(result?.publication?.revisionId).toBe(9);
    expect(result?.draft?.input).not.toBe(draft.input);
  });
  it('legt beim Laden keine Revision an und erhält echte Leerzustände', () => {
    expect(readAdminReference(null)).toBeNull();
    expect(readAdminPage({ rows: [], hasMore: false, nextOffset: null })).toEqual({
      rows: [],
      hasMore: false,
      nextOffset: null,
    });
  });
  it('prüft Identitäten und boolesche Archivwerte', () => {
    expect(() =>
      readAdminReference({ ...base, draft: { ...draft, referenceId: 3 }, publication: null }),
    ).toThrow();
    expect(() =>
      readAdminReference({ ...base, archived: 'false', draft, publication: null }),
    ).toThrow();
  });
  it('weist doppelte Zeilen und widersprüchliche Pagination ab', () => {
    expect(() => readAdminPage({ rows: [row, row], hasMore: false, nextOffset: null })).toThrow();
    expect(() => readAdminPage({ rows: [row], hasMore: true, nextOffset: null })).toThrow();
    expect(() =>
      readAdminPage({ rows: [{ ...row, state: 'unexpected' }], hasMore: false, nextOffset: null }),
    ).toThrow();
  });
  it('weist ungültige Entwurfsinhalte zurück', () => {
    expect(() =>
      readAdminDraft({
        ...draft,
        input: {
          ...draft.input,
          content: { ...createEmptyLabelContent(), relatedReferenceIds: [0] },
        },
      }),
    ).toThrow();
  });
  it('hält Wiederholungen unveränderlich fest', () => {
    const input = {
      action: 'archive' as const,
      referenceId: 1,
      expectedVersion: 4,
      requestId: '00000000-0000-4000-8000-000000000001',
    };
    const command = prepareAdminCommand(input);
    input.expectedVersion = 5;
    expect(command.action === 'archive' && command.expectedVersion).toBe(4);
    expect(Object.isFrozen(command)).toBe(true);
  });
  it('weist unbrauchbare Auftragskennungen zurück', () => {
    expect(() => prepareAdminCommand({ action: 'create', brandId: 0, requestId: 'bad' })).toThrow();
  });
});

describe('Labelbibliothek: bestätigte Leserfreigabe', () => {
  it('friert Leseraufträge ein und bestätigt exakt den angefragten Schalterwert', () => {
    const command = prepareReaderCommand(true, '00000000-0000-4000-8000-000000000001');
    expect(Object.isFrozen(command)).toBe(true);
    expect(readReaderReceipt({ visible: true, operator: true, readerEnabled: true }, command)).toBe(
      true,
    );
  });
  it('weist die bisherige Betreiber-Verfügbarkeit ohne tatsächlichen Schalterstand zurück', () => {
    const command = prepareReaderCommand(true, '00000000-0000-4000-8000-000000000001');
    expect(() => readReaderReceipt({ visible: true, operator: true }, command)).toThrow();
    expect(() =>
      readReaderReceipt({ visible: true, operator: true, readerEnabled: false }, command),
    ).toThrow();
    expect(() =>
      readReaderReceipt({ visible: true, operator: false, readerEnabled: true }, command),
    ).toThrow();
  });
});
