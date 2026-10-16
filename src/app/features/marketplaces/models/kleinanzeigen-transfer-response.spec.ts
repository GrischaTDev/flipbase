import { describe, it, expect } from 'vitest';
import {
  parseTransferSourceResponse,
  parseTransferDraftResponse,
} from './kleinanzeigen-transfer-response';
const reference = {
  platform: 'vinted' as const,
  workspaceId: '50300000-0000-4000-8000-000000000011',
  connectionId: '50300000-0000-4000-8000-000000000021',
  externalId: '123',
};
const request = {
  workspaceId: reference.workspaceId,
  targetConnectionId: '9007199254740993',
  source: reference,
};
const read = {
  state: 'ready',
  workspaceId: reference.workspaceId,
  targetConnectionId: request.targetConnectionId,
  connectionId: reference.connectionId,
  entryId: '50300000-0000-4000-8000-000000000031',
  externalId: '123',
  externalAccountId: '99',
  executionMode: 'cloud',
  source: {
    externalAccountId: '99',
    externalId: '123',
    title: 'x'.repeat(66),
    description: 'y'.repeat(4001),
    priceCents: 1200,
    currency: 'EUR',
    photoReferences: ['https://images1.vinted.net/a.jpg'],
    attributeHints: { brand: 'Marke' },
  },
  observedAt: new Date().toISOString(),
  fingerprint: 'a'.repeat(64),
};
describe('Transferantworten', () => {
  it('erhält vollständigen Quelltext und große Kontokennung', () => {
    const result = parseTransferSourceResponse(read, request);
    expect(result?.source?.description.length).toBe(4001);
    expect(result?.targetConnectionId).toBe(request.targetConnectionId);
  });
  it('verwirft falschen Kontext, fremde Fotos, zusätzliche Secrets und falsche Quelle', () => {
    for (const change of [
      { targetConnectionId: '12' },
      { workspaceId: '50300000-0000-4000-8000-000000000012' },
      { source: { ...read.source, externalId: '124' } },
      { source: { ...read.source, photoReferences: ['https://localhost/a'] } },
      { token: 'private' },
      { observedAt: 'bad' },
    ])
      expect(parseTransferSourceResponse({ ...read, ...change }, request)).toBeNull();
  });
  it('validiert gespeicherte Zielfassung mit Quellfingerprint und Bildstatus', () => {
    const sourceReference = { ...reference, entryId: read.entryId, fingerprint: read.fingerprint };
    const draft = {
      id: '50300000-0000-4000-8000-000000000041',
      workspaceId: reference.workspaceId,
      targetConnectionId: request.targetConnectionId,
      sourceReference,
      revision: 2,
      status: 'prepared',
      imagesComplete: true,
      content: {
        title: 'Jacke',
        description: 'Text',
        priceCents: 1200,
        currency: 'EUR',
        priceType: 'FIXED',
        shippingType: 'pickup',
        shippingPriceCents: null,
        postalCode: null,
        categoryId: null,
        categoryFields: {},
        schemaRevision: null,
      },
    };
    expect(parseTransferDraftResponse(draft, { ...request, sourceReference })?.imagesComplete).toBe(
      true,
    );
    for (const change of [
      { sourceReference: { ...sourceReference, fingerprint: 'b'.repeat(64) } },
      { revision: 0 },
      { content: { ...draft.content, priceCents: null } },
      { content: { ...draft.content, title: 'x'.repeat(66) } },
      { secret: 'private' },
    ])
      expect(
        parseTransferDraftResponse({ ...draft, ...change }, { ...request, sourceReference }),
      ).toBeNull();
  });
});
