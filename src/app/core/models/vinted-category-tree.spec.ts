import { describe, expect, it } from 'vitest';
import { buildVintedCategoryTree } from './vinted-category-tree';

const categories = [
  { id: 1, parentId: null, title: 'Herren' },
  { id: 2, parentId: 1, title: 'Hosen' },
  { id: 3, parentId: 2, title: 'Jogginghosen' },
  { id: 4, parentId: null, title: 'Damen' },
  { id: 5, parentId: 4, title: 'Jogginghosen' },
];
describe('complete category hierarchy', () => {
  it('builds distinct full paths and retains selectable parents', () => {
    const tree = buildVintedCategoryTree(categories);
    expect(tree.search('Jogginghosen').map((category) => category.path)).toEqual([
      'Herren > Hosen > Jogginghosen',
      'Damen > Jogginghosen',
    ]);
    expect(tree.get(2)).toMatchObject({ isLeaf: false, isAvailable: true, ancestorIds: [1] });
    expect(tree.children(1).map((category) => category.id)).toEqual([2]);
    expect(tree.search('herren jogginghosen').map((category) => category.id)).toEqual([3]);
  });
  it('does not cut off valid search results at thirty or a thousand entries', () => {
    const rows = [
      categories[0],
      ...Array.from({ length: 1500 }, (_, n) => ({ id: n + 100, parentId: 1, title: `Hose ${n}` })),
    ];
    expect(buildVintedCategoryTree(rows).search('Hose')).toHaveLength(1500);
  });
  it('does not turn missing IDs into unrestricted roots', () => {
    const tree = buildVintedCategoryTree(categories);
    expect(tree.get(999)).toBeNull();
    expect(() => tree.children(999)).toThrow();
  });
  it.each([
    { name: 'duplicate', rows: [...categories, categories[0]] },
    { name: 'orphan', rows: [{ id: 1, parentId: 999, title: 'Jacken' }] },
    {
      name: 'cycle',
      rows: [
        { id: 1, parentId: 2, title: 'A' },
        { id: 2, parentId: 1, title: 'B' },
      ],
    },
    { name: 'self-reference', rows: [{ id: 1, parentId: 1, title: 'A' }] },
    { name: 'invalid-ID', rows: [{ id: 0, parentId: null, title: 'A' }] },
  ])('rejects a $name snapshot', ({ rows }) =>
    expect(() => buildVintedCategoryTree(rows)).toThrow(),
  );
  it('does not change the input data', () => {
    const frozen = Object.freeze(categories.map((category) => Object.freeze({ ...category })));
    expect(buildVintedCategoryTree(frozen).get(3)?.path).toBe('Herren > Hosen > Jogginghosen');
  });
});
