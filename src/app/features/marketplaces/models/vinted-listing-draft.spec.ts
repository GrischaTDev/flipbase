import { describe, expect, it } from 'vitest';
import { parseVintedListingDraft, parseVintedListingTemplate } from './vinted-listing-draft';

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
  it('keeps large database IDs as strings without rounding', () => {
    expect(parseVintedListingDraft(draft, 'workspace-a').id).toBe('9007199254740999');
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
