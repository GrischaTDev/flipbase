import { describe, expect, it } from 'vitest';
import {
  listingResponse,
  parseVintedListingDraft,
  parseVintedListingTemplate,
  VintedListingCatalogError,
  VintedListingStorageError,
} from './vinted-listing-draft';

const draft = {
  id: '9007199254740999',
  workspaceId: 'workspace-a',
  connectionId: null,
  revision: 1,
  content: { title: 'Jacke' },
  inventoryItemId: null,
  createdAt: '2026-10-09T12:00:00Z',
  updatedAt: '2026-10-09T12:00:00Z',
  images: [],
};
describe('Gespeicherte Vinted-Entwürfe', () => {
  it('unterscheidet bestätigte Katalogablehnungen von fehlenden Auftragsantworten', () => {
    const categoryMessage = 'Wähle im Entwurf eine aktuelle Vinted-Kategorie.';
    const packageMessage = 'Wähle im Entwurf einen gültigen Wert für „Paketgröße“.';
    for (const [message, field] of [
      [categoryMessage, 'category'],
      [packageMessage, 'package'],
    ]) {
      const response = () => listingResponse({ data: null, error: { code: 'PV001', message } });
      expect(response).toThrow(VintedListingCatalogError);
      expect(response).toThrow(expect.objectContaining({ field, message }));
    }
    const transportError = () =>
      listingResponse({
        data: null,
        error: { message: categoryMessage },
      });
    expect(transportError).toThrow(VintedListingStorageError);
    expect(transportError).not.toThrow(VintedListingCatalogError);
  });
  it('keeps large database IDs as strings without rounding', () => {
    expect(parseVintedListingDraft(draft, 'workspace-a').id).toBe('9007199254740999');
  });
  it('liest den Einzelrabatt getrennt vom Inseratsinhalt und unterscheidet Zurücksetzen und Auslassen', () => {
    const parseWithDiscount = (favoriteDiscountPercent: unknown) =>
      parseVintedListingDraft(
        { ...draft, content: { ...draft.content, favoriteDiscountPercent } },
        'workspace-a',
      );
    const withDiscount = parseWithDiscount(12.5);
    expect(withDiscount.favoriteDiscountPercent).toBe(12.5);
    expect(withDiscount.content).not.toHaveProperty('favoriteDiscountPercent');
    expect(parseWithDiscount(null).favoriteDiscountPercent).toBeNull();
    expect(parseVintedListingDraft(draft, 'workspace-a')).not.toHaveProperty(
      'favoriteDiscountPercent',
    );
    expect(() => parseWithDiscount(50.01)).toThrow();
    expect(() => parseWithDiscount('12.5')).toThrow();
  });
  it('rejects responses from another workspace or draft', () => {
    expect(() => parseVintedListingDraft(draft, 'workspace-b')).toThrow();
    expect(() => parseVintedListingDraft(draft, 'workspace-a', '22')).toThrow();
  });
  it('rejects an image path from another draft', () => {
    expect(() =>
      parseVintedListingDraft(
        {
          ...draft,
          images: [
            {
              id: '1',
              storagePath: 'workspace-a/other/a.jpg',
              fileName: 'a.jpg',
              mimeType: 'image/jpeg',
              byteSize: 20,
            },
          ],
        },
        'workspace-a',
      ),
    ).toThrow();
  });
  it('retains only selected template fields', () => {
    const template = parseVintedListingTemplate(
      {
        id: '1',
        workspaceId: 'workspace-a',
        name: 'Jacken',
        fields: { title: '{brand} Jacke' },
        revision: 1,
        updatedAt: draft.updatedAt,
      },
      'workspace-a',
    );
    expect(Object.keys(template.fields)).toEqual(['title']);
  });
});
