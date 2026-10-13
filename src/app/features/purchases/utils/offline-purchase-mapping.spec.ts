import { describe, expect, it } from 'vitest';
import { offlinePurchaseLines, offlinePurchaseNotes } from './offline-purchase-mapping';
import { validateOfflineContent, validateOfflineDraft } from './offline-purchase-validation';
import type { OfflinePurchaseContent } from '../models/offline-purchase-draft.models';

const content: OfflinePurchaseContent = {
  draftName: 'Lokale Messe',
  purchaseDate: '2026-10-13',
  sellerNote: 'Verkäufer A',
  notes: 'Prüfen',
  lines: [
    {
      lineId: '11111111-1111-4111-8111-111111111111',
      title: 'Lampe',
      ean: null,
      quantity: 3,
      condition: 'used',
      unitPriceCents: 7,
    },
  ],
};
describe('Offline purchase review mapping', () => {
  it('preserves calendar date, exact cents and local name without inventing a catalog assignment', () => {
    validateOfflineContent(content);
    expect(offlinePurchaseLines(content)[0]).toMatchObject({
      catalogProductId: null,
      unitPurchasePrice: 0.07,
      lineTotal: 0.21,
      priceMode: 'priced',
    });
    expect(content.purchaseDate).toBe('2026-10-13');
    expect(offlinePurchaseNotes(content)).toBe(
      'Verkäufernotiz:\nVerkäufer A\n\nAllgemeine Notiz:\nPrüfen',
    );
  });
  it('keeps unknown price and explicit assignments through later offline edits', () => {
    const initial = offlinePurchaseLines(content);
    initial[0] = { ...initial[0], catalogProductId: '22222222-2222-4222-8222-222222222222' };
    expect(
      offlinePurchaseLines(
        { ...content, lines: [{ ...content.lines[0], unitPriceCents: null }] },
        initial,
      )[0],
    ).toMatchObject({
      catalogProductId: initial[0].catalogProductId,
      unitPurchasePrice: null,
      lineTotal: null,
      priceMode: 'open',
    });
  });
  it('rejects impossible dates, fractional cents, duplicate lines and oversized drafts', () => {
    for (const invalid of [
      { ...content, purchaseDate: '2026-02-30' },
      { ...content, lines: [{ ...content.lines[0], unitPriceCents: 0.1 }] },
      { ...content, lines: [...content.lines, ...content.lines] },
      { ...content, draftName: 'x'.repeat(201) },
    ])
      expect(() => validateOfflineContent(invalid)).toThrow();
  });
  it('rejects unknown persisted schemas before using a draft', () => {
    expect(() => validateOfflineDraft({ schemaVersion: 2 } as never)).toThrow('Format');
  });
});
