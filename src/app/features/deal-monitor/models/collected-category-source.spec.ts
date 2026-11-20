import { describe, expect, it } from 'vitest';
import type { VintedCategory } from '../../platform-admin/models/vinted-category.model';
import { collectedCategorySource } from './collected-category-source';

const categories: VintedCategory[] = [
  { id: 5, parentId: null, title: 'Herren', path: 'Herren' },
  { id: 2050, parentId: 5, title: 'Kleidung', path: 'Herren > Kleidung' },
  {
    id: 2051,
    parentId: 2050,
    title: 'Jacken & Mäntel',
    path: 'Herren > Kleidung > Jacken & Mäntel',
  },
  {
    id: 2052,
    parentId: 2051,
    title: 'Jacken',
    path: 'Herren > Kleidung > Jacken & Mäntel > Jacken',
  },
  {
    id: 1858,
    parentId: 2052,
    title: 'Fleecejacken',
    path: 'Herren > Kleidung > Jacken & Mäntel > Jacken > Fleecejacken',
  },
  {
    id: 2536,
    parentId: 2052,
    title: 'Daunenjacken',
    path: 'Herren > Kleidung > Jacken & Mäntel > Jacken > Daunenjacken',
  },
  { id: 257, parentId: 2050, title: 'Jeans', path: 'Herren > Kleidung > Jeans' },
  { id: 1904, parentId: null, title: 'Damen', path: 'Damen' },
];

describe('collectedCategorySource', () => {
  it('bietet nur Kategorien mit eigenem Bot an und zeigt den Weg dorthin', async () => {
    const source = collectedCategorySource(categories, [2050, 1858]);

    expect(
      (await source.loadChildren(null)).map(({ name, isSelectable }) => [name, isSelectable]),
    ).toEqual([['Herren', false]]);
    const clothing = await source.loadChildren('5');
    expect(clothing.map(({ id, isSelectable }) => [id, isSelectable])).toEqual([
      ['2050', undefined],
    ]);
    // Jeans und Daunenjacken haben keinen Bot und erscheinen nicht.
    expect((await source.loadChildren('2050')).map(({ id }) => id)).toEqual(['2051']);
    expect(
      (await source.loadChildren('2052')).map(({ id, isSelectable }) => [id, isSelectable]),
    ).toEqual([['1858', undefined]]);
    expect((await source.search('jacken')).categories.map(({ id }) => id)).toEqual(['1858']);
  });

  it('benennt eine gespeicherte Kategorie ohne Bot weiterhin', async () => {
    const source = collectedCategorySource(categories, [1858]);

    expect((await source.getById('2536'))?.fullName).toBe(
      'Herren > Kleidung > Jacken & Mäntel > Jacken > Daunenjacken',
    );
    expect(await source.search('daunen')).toEqual({ categories: [], hasMore: false });
  });

  it('bietet ohne Kategorie-Bot nichts an', async () => {
    const source = collectedCategorySource(categories, [999_999]);

    expect(await source.loadChildren(null)).toEqual([]);
  });
});
