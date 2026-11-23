import { describe, expect, it } from 'vitest';
import { vintedCategorySource } from './vinted-category-source';
const rows = [
  { id: 1, parentId: null, title: 'Herren' },
  { id: 2, parentId: 1, title: 'Kleidung' },
  { id: 3, parentId: 2, title: 'Jacken' },
  { id: 4, parentId: null, title: 'Damen' },
];
describe('Vinted-Datenquelle des gemeinsamen Kategorie-Wählers', () => {
  it('bildet Kennungen ab, ohne eine Flipbase-Kategorie zu verwenden', async () => {
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
  it('versteckt keine weiteren Treffer hinter dem Limit der internen Kategorien', async () => {
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

describe('Vinted-Auswahl für den Wiederverkauf', () => {
  const source = vintedCategorySource([
    { id: 1918, parentId: null, title: 'Home' },
    { id: 3811, parentId: 1918, title: 'Werkzeuge & Heimwerken' },
    { id: 3883, parentId: 3811, title: 'Schutzausrüstung' },
    { id: 4019, parentId: 3883, title: 'Arbeitshandschuhe' },
    { id: 3875, parentId: 3811, title: 'Elektrowerkzeuge' },
    { id: 3887, parentId: 3811, title: 'Smart Home & Sicherheit' },
    { id: 5106, parentId: 1918, title: 'Haustierbedarf' },
    { id: 5110, parentId: 5106, title: 'Hundeartikel' },
    { id: 4332, parentId: null, title: 'Sport' },
    { id: 4333, parentId: 4332, title: 'Fahrradfahren' },
    { id: 4347, parentId: 4333, title: 'Räder für Kinder' },
    { id: 4373, parentId: 4347, title: 'Kinderfahrräder' },
    { id: 4348, parentId: 4333, title: 'Fahrradhelme' },
    { id: 2994, parentId: null, title: 'Elektronik' },
    { id: 3035, parentId: 2994, title: 'Smartwatches' },
    { id: 1193, parentId: null, title: 'Kinder' },
    { id: 1496, parentId: 1193, title: 'Kinderwagen, Tragen & Autositze' },
  ]);
  it('entfernt fachfremde Bereiche aus Baum und Suche und löst gespeicherte Werte weiter auf', async () => {
    expect((await source.loadChildren('1918')).map((row) => row.id)).toEqual(['3811']);
    expect(await source.search('Hunde')).toEqual({ categories: [], hasMore: false });
    expect(await source.loadChildren('5106')).toEqual([]);
    expect(await source.getById('5110')).toMatchObject({
      id: '5110',
      name: 'Hundeartikel',
      isDeprecated: false,
    });
  });
  it('erhält Bekleidung unter gesperrten Eltern und schützt reine Navigationsknoten vor Auswahl', async () => {
    expect(await source.getById('3811')).toMatchObject({ isSelectable: false });
    expect((await source.search('Arbeitshandschuhe')).categories.map((row) => row.id)).toEqual([
      '4019',
    ]);
    expect(await source.search('Elektrowerkzeuge')).toEqual({ categories: [], hasMore: false });
  });
  it('erhält Technik, Sportausrüstung und Kinderwagen, aber keine Fahrräder unter Sport', async () => {
    expect((await source.search('Smart Home')).categories.map((row) => row.id)).toEqual(['3887']);
    expect((await source.search('Smartwatches')).categories.map((row) => row.id)).toEqual(['3035']);
    expect((await source.search('Fahrradhelme')).categories.map((row) => row.id)).toEqual(['4348']);
    expect((await source.search('Kinderwagen')).categories.map((row) => row.id)).toEqual(['1496']);
    expect((await source.search('Kinderfahrräder')).categories).toEqual([]);
  });
});
