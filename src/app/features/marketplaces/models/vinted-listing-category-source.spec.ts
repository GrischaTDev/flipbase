import { describe, expect, it } from 'vitest';
import { vintedListingCategorySource } from './vinted-listing-category-source';

describe('Kategorien für neue Vinted-Inserate', () => {
  it('erhält die Navigation und alte Oberkategorien, erlaubt aber nur konkrete Kategorien als neue Auswahl', async () => {
    const source = vintedListingCategorySource([
      { id: 5, parentId: null, title: 'Damen' },
      { id: 16, parentId: 5, title: 'Schuhe' },
      { id: 17, parentId: 16, title: 'Sneaker' },
    ]);
    expect(await source.getById('16')).toMatchObject({
      name: 'Schuhe',
      isSelectable: false,
      isLeaf: false,
    });
    expect(await source.loadChildren('5')).toMatchObject([{ id: '16', isSelectable: false }]);
    expect(await source.loadChildren('16')).toMatchObject([{ id: '17', isSelectable: true }]);
    expect((await source.search('Schuhe')).categories).toMatchObject([{ id: '17', isLeaf: true }]);
  });
});
