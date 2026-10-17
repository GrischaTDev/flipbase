import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { KLEINANZEIGEN_CATEGORY_SNAPSHOT } from '../data/kleinanzeigen-category-snapshot';
import { createKleinanzeigenCategorySource } from './kleinanzeigen-category-source';

describe('Gesicherter Kleinanzeigen-Kategoriebaum', () => {
  const source = createKleinanzeigenCategorySource(KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories);
  it('enthält alle 15 Wurzeln, 152 geprüften Äste und 3.087 Endkategorien', async () => {
    expect(KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories).toHaveLength(3239);
    expect(KLEINANZEIGEN_CATEGORY_SNAPSHOT.scannedParents).toBe(152);
    expect(await source.loadChildren(null)).toHaveLength(15);
    expect(KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories.filter((row) => !row.isParent)).toHaveLength(
      3087,
    );
    for (const row of KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories) {
      const category = await source.getById(row.path);
      expect(category?.name).toBe(row.name);
      expect(category?.isLeaf).toBe(!row.isParent);
      expect(await source.loadChildren(row.path)).toHaveLength(
        row.isParent
          ? KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories.filter(
              (child) => child.path.slice(0, child.path.lastIndexOf('/')) === row.path,
            ).length
          : 0,
      );
    }
  });
  it('stimmt unverändert mit sämtlichen im Browser erfassten Bezeichnungen und Pfaden überein', () => {
    expect(
      createHash('sha256')
        .update(JSON.stringify(KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories))
        .digest('hex'),
    ).toBe('4cf0d12d73e696735f2d3cb47a3d62ab806ac08acc57c2ab0032dcdcca1c2f1a');
  });
  it('erhält die vollständigen Anbieterpfade und findet Bekleidung über Suchbegriffe', async () => {
    expect(await source.getById('153/160/hemden')).toMatchObject({
      id: '153/160/hemden',
      parentId: '153/160',
      name: 'Hemden',
      fullName: 'Mode & Beauty > Herrenbekleidung > Hemden',
      isLeaf: true,
    });
    expect((await source.search('herren hemden')).categories.map((row) => row.id)).toContain(
      '153/160/hemden',
    );
    expect((await source.search('HÄUSER')).categories.length).toBeGreaterThan(0);
    expect(await source.getById('160')).toBeNull();
  });
  it('verwirft doppelte Pfade, fehlende Eltern und widersprüchliche Endkategorien', () => {
    expect(() =>
      createKleinanzeigenCategorySource([
        { path: '153', name: 'Mode', isParent: false },
        { path: '153', name: 'Anders', isParent: false },
      ]),
    ).toThrow();
    expect(() =>
      createKleinanzeigenCategorySource([{ path: '153/160', name: 'Herren', isParent: false }]),
    ).toThrow();
    expect(() =>
      createKleinanzeigenCategorySource([
        { path: '153', name: 'Mode', isParent: false },
        { path: '153/160', name: 'Herren', isParent: false },
      ]),
    ).toThrow();
  });
});
