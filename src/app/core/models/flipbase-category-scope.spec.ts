import { describe, expect, it } from 'vitest';
import { flipbaseCategoryAllowed, flipbaseCategoryVisible } from './flipbase-category-scope';
import { categorySelectionAllowed, categoryNavigationIds } from './category-selection-scope';

describe('Freigegebene Auswahl der Flipbase-Kategorien', () => {
  it.each([
    ['aa-1-25', true],
    ['aa-6-12', true],
    ['el-6-6', true],
    ['so', true],
    ['fr', true],
    ['bt-6-1', true],
    ['bt-6-3', true],
    ['bt-10-1', false],
    ['bt-10-6', true],
    ['hb-1-9-1', false],
    ['hb-1-9-6', true],
    ['hb-3', true],
    ['hg-11', true],
    ['hg-3-3', true],
    ['hg-12-1', false],
    ['hg-17', false],
    ['hg-17-3-3-1', false],
    ['hg-17-5-2-2-1', false],
    ['hg-3-7', false],
    ['hg-3-7-1', false],
    ['hg-3-8', false],
    ['hg-3-8-1', false],
    ['sg-4-5-1', false],
    ['sg-4-5-1-3-1', false],
    ['sg-4-5-2', false],
    ['sg-4-5-3', false],
    ['sg-4-5-4', false],
    ['sg-4-5-6', false],
    ['sg-4-5-5-1', true],
    ['sg-4-5-5-4-1', true],
    ['hg-3-9', false],
    ['hg-3-10', false],
    ['hg-3-11', false],
    ['sg-4-9-3-4', false],
    ['sg-4-9-3-7-4', false],
    ['sg-4-9-3-7-4-3', false],
    ['ap-2', false],
    ['ha', false],
    ['bi-22', false],
    ['bi-25-14', true],
    ['bi-25-140', false],
    ['bi-25-13', true],
    ['bi-19-2-1', true],
    ['vp-2', false],
    ['vp-1-6-1-3', true],
    ['vp-1-6-7-7', true],
    ['fb', false],
    ['fb-1', false],
    ['fb-2', false],
    ['fb-3', true],
    ['ma-1-2', false],
    ['sg-4-4-3', false],
    ['sg-4-4-2', false],
    ['sg-4-4-4-9', true],
    ['sg-4-2', true],
    ['sg-4-6-16', false],
    ['ae-2-1-7-2', true],
    ['tg-5-16-7-1', true],
  ] as const)('ordnet %s entsprechend dem freigegebenen Sortiment ein', (id, allowed) => {
    expect(flipbaseCategoryAllowed(id)).toBe(allowed);
  });
  it('erhält ausgeschlossene Vorfahren nur für den Weg zu erlaubter Bekleidung', () => {
    expect(flipbaseCategoryVisible('vp')).toBe(true);
    expect(flipbaseCategoryAllowed('vp')).toBe(false);
    expect(flipbaseCategoryVisible('ap')).toBe(false);
    expect(flipbaseCategoryVisible('bi-25')).toBe(true);
    expect(flipbaseCategoryVisible('bi-22')).toBe(false);
  });
  it('vererbt die spezifischste Regel und erzeugt nur benötigte Navigationspfade', () => {
    const rules = { excluded: ['root', 'leaf-block'], included: ['clothes'] };
    expect(categorySelectionAllowed(['root', 'clothes', 'leaf'], rules)).toBe(true);
    expect(categorySelectionAllowed(['root', 'clothes', 'leaf-block'], rules)).toBe(false);
    expect([
      ...categoryNavigationIds(
        [
          ['root', 'clothes', 'leaf'],
          ['root', 'tools'],
        ],
        rules,
      ),
    ]).toEqual(['root', 'clothes', 'leaf']);
  });
});
