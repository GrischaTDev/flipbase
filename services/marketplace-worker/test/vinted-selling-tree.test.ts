import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseVintedSellingTree,
  flattenVintedSellingCatalogs,
} from '../../../supabase/functions/_shared/vinted-selling-tree.mjs';

test('selling trees retain account-specific hierarchy and provider IDs', () => {
  const modern = flattenVintedSellingCatalogs({
    catalogs: [
      {
        id: 5496,
        title: 'Modeaccessoires',
        catalogs: [{ id: 5555, title: 'Tücher & Schals', catalogs: [] }],
      },
    ],
  });
  const old = flattenVintedSellingCatalogs({
    catalogs: [
      { id: 1, title: 'Damen', catalogs: [{ id: 89, title: 'Tücher & Schals', catalogs: [] }] },
    ],
  });
  assert.equal(modern[1]?.parentId, 5496);
  assert.equal(old[1]?.id, 89);
  assert.equal(modern[1]?.path, 'Modeaccessoires > Tücher & Schals');
  assert.equal(
    modern.some((node) => node.id === 89),
    false,
  );
});
test('rejects incomplete, cyclic, duplicate or incorrectly labelled snapshots', () => {
  for (const rows of [
    [],
    [{ id: 1, parentId: 2, title: 'S', path: 'S', isLeaf: true }],
    [{ id: 1, parentId: 1, title: 'S', path: 'S', isLeaf: true }],
    [{ id: 1, parentId: null, title: 'S', path: 'wrong', isLeaf: true }],
    [{ id: 1, parentId: null, title: 'S', path: 'S', isLeaf: false }],
  ])
    assert.throws(() => parseVintedSellingTree(rows));
  assert.throws(() =>
    flattenVintedSellingCatalogs({
      catalogs: [
        { id: 1, title: 'Damen', catalogs: [] },
        { id: 1, title: 'Herren', catalogs: [] },
      ],
    }),
  );
});
