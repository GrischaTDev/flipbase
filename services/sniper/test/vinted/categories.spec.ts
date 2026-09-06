import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCategoryTree } from '../../src/vinted/categories.js';

const html = readFileSync(new URL('../fixtures/vinted-homepage.html', import.meta.url), 'utf8');

describe('parseCategoryTree', () => {
  it('liest alle Knoten flach aus, samt Elternverweis', () => {
    const categories = parseCategoryTree(html);

    expect(categories).toHaveLength(6);
    expect(categories.find((entry) => entry.id === 1904)).toEqual({
      id: 1904,
      parentId: null,
      title: 'Damen',
      slug: '1904-women',
      path: 'Damen',
      isLeaf: false,
    });
    expect(categories.find((entry) => entry.id === 1049)).toEqual({
      id: 1049,
      parentId: 16,
      title: 'Stiefel',
      slug: '1049-boots',
      path: 'Damen > Schuhe > Stiefel',
      isLeaf: true,
    });
  });

  it('kennzeichnet nur Knoten ohne Unterkategorien als Blatt', () => {
    const categories = parseCategoryTree(html);
    const leaves = categories.filter((entry) => entry.isLeaf).map((entry) => entry.id);

    expect(leaves.sort((a, b) => a - b)).toEqual([76, 1049, 2955]);
  });

  it('wirft, wenn kein Baum im HTML steht', () => {
    expect(() => parseCategoryTree('<html><body>nichts</body></html>')).toThrow(
      'Kein catalogTree im HTML gefunden',
    );
  });

  it('wirft, wenn der Baum leer ist', () => {
    const empty = 'self.__next_f.push([1,"x:[\\"$\\",{\\"catalogTree\\":[]}]"])';

    expect(() => parseCategoryTree(empty)).toThrow('Der catalogTree ist leer');
  });

  // Auf der echten Startseite kommt der Schluessel mehrfach vor: einmal mit dem
  // ausgeschriebenen Baum, danach als Verweis der Form "$d4:props:catalogTree".
  // Das Fixture bildet beides ab. Ohne diesen Test waere nur behauptet, dass
  // der Parser ueber Verweise hinweggeht statt an ihnen haengenzubleiben.
  it('geht ueber Verweisbloecke hinweg und nimmt den ausgeschriebenen Baum', () => {
    expect(html).toContain('$d4:props:catalogTree');

    const categories = parseCategoryTree(html);

    expect(categories).toHaveLength(6);
  });

  it('nimmt den ausgeschriebenen Baum auch, wenn ein Verweis vor ihm steht', () => {
    const referenceFirst = [
      'self.__next_f.push([1,"db:[\\"$\\",{\\"catalogTree\\":\\"$d4:props:catalogTree\\"}]\\n"])',
      'self.__next_f.push([1,"d4:[\\"$\\",{\\"catalogTree\\":[{\\"id\\":5,\\"title\\":\\"Herren\\",\\"url\\":\\"/catalog/5-men\\"}]}]\\n"])',
    ].join('\n');

    const categories = parseCategoryTree(referenceFirst);

    expect(categories).toEqual([
      { id: 5, parentId: null, title: 'Herren', slug: '5-men', path: 'Herren', isLeaf: true },
    ]);
  });
});
