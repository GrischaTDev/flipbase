import { describe, expect, it } from 'vitest';
import { vintedCategorySource } from './vinted-category-source';
const rows = [
  { id: 1, parentId: null, title: 'Herren' },
  { id: 2, parentId: 1, title: 'Kleidung' },
  { id: 3, parentId: 2, title: 'Jacken' },
  { id: 4, parentId: null, title: 'Damen' },
];
describe('Vinted-Datenquelle des gemeinsamen Kategorie-Wählers', () => {
  it('bildet Kennungen ab, ohne eine Shopify-Kategorie zu verwenden', async () => {
    expect(await vintedCategorySource(rows).getById('3')).toMatchObject({
      id: '3',
      parentId: '2',
      fullName: 'Herren > Kleidung > Jacken',
      isLeaf: true,
    });
  });
  it('bietet Oberkategorien und getrennte Ebenen an', async () => {
    expect((await vintedCategorySource(rows).loadChildren(null)).map((row) => row.id)).toEqual([
      '1',
      '4',
    ]);
    expect((await vintedCategorySource(rows).loadChildren('1')).map((row) => row.id)).toEqual([
      '2',
    ]);
  });
  it('findet den vollständigen Pfad mit mehreren Suchwörtern', async () => {
    expect(
      (await vintedCategorySource(rows).search('Herren Jacken')).categories.map((row) => row.id),
    ).toEqual(['3']);
  });
  it('versteckt keine weiteren Treffer hinter dem Shopify-Limit', async () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      id: i + 1,
      parentId: null,
      title: `Jacke ${i}`,
    }));
    expect((await vintedCategorySource(many).search('Jacke')).categories).toHaveLength(80);
  });
  it('erfindet bei unbekannten Kennungen keine Oberkategorie', async () => {
    expect(await vintedCategorySource(rows).getById('99')).toBeNull();
    await expect(vintedCategorySource(rows).loadChildren('99')).rejects.toThrow();
  });
  it('weist einen unvollständigen Baum zurück', () => {
    expect(() => vintedCategorySource([{ id: 3, parentId: 2, title: 'Jacken' }])).toThrow();
  });
});
