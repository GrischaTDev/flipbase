import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { KLEINANZEIGEN_CATEGORY_SNAPSHOT } from '../data/kleinanzeigen-category-snapshot';
import { createKleinanzeigenCategorySource } from './kleinanzeigen-category-source';

describe('Gesicherter Kleinanzeigen-Kategoriebaum', () => {
  const source = createKleinanzeigenCategorySource(KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories);
  it('enthält alle 15 Wurzeln, 152 geprüften Äste und 3.087 Endkategorien', async () => {
    expect(KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories).toHaveLength(3239);
    expect(KLEINANZEIGEN_CATEGORY_SNAPSHOT.scannedParents).toBe(152);
    expect(
      KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories.filter((row) => !row.path.includes('/')),
    ).toHaveLength(15);
    expect(KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories.filter((row) => !row.isParent)).toHaveLength(
      3087,
    );
    for (const row of KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories) {
      const category = await source.getById(row.path);
      expect(category?.name).toBe(row.name);
      expect(category?.isLeaf).toBe(!row.isParent);
      expect(category?.parentId).toBe(
        row.path.includes('/') ? row.path.slice(0, row.path.lastIndexOf('/')) : null,
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
    expect((await source.search('MÄNTEL')).categories.length).toBeGreaterThan(0);
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

describe('Kleinanzeigen-Auswahl für den Wiederverkauf', () => {
  const source = createKleinanzeigenCategorySource(KLEINANZEIGEN_CATEGORY_SNAPSHOT.categories);
  it('entfernt Jobs, Immobilien, Dienstleistungen und Tierbedarf aus Suche und Ebenen', async () => {
    const roots = (await source.loadChildren(null)).map((row) => row.id);
    for (const id of ['102', '195', '297', '130', '235', '400']) expect(roots).not.toContain(id);
    expect((await source.search('Häuser')).categories).toEqual([]);
    expect((await source.search('Tierbetreuung')).categories).toEqual([]);
    expect((await source.loadChildren('210')).map((row) => row.id)).toEqual(['210/306']);
    expect(await source.getById('210/306')).toMatchObject({ isSelectable: false });
    expect((await source.search('Motorradbekleidung')).categories.map((row) => row.id)).toEqual([
      '210/306/kleidung',
    ]);
  });
  it('erhält alle Originalkennungen und gespeicherte ausgeblendete Kategorien', async () => {
    expect(await source.getById('195/208')).toMatchObject({
      id: '195/208',
      name: 'Häuser zum Kauf',
      isDeprecated: false,
    });
    expect(source.getCategory('195/208')?.name).toBe('Häuser zum Kauf');
  });
  it('erhält Technik, Beauty, Kinderwagen, Einrichtung und Camping', async () => {
    const roots = (await source.loadChildren(null)).map((row) => row.id);
    for (const id of ['161', '153', '17', '80', '185', '73']) expect(roots).toContain(id);
    expect((await source.search('Kinderwagen')).categories.length).toBeGreaterThan(0);
    expect((await source.search('Sport Camping')).categories.length).toBeGreaterThan(0);
    expect((await source.search('Gartenzubehör')).categories).toEqual([]);
    expect((await source.search('Essen Trinken')).categories).toEqual([]);
  });
});
