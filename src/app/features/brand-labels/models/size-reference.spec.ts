import { describe, expect, it } from 'vitest';
import { parseSizeTable, readSizeContent, readSizeReferences } from './size-reference';
const content = {
  title: 'Hersteller-Hosen',
  category: 'trousers',
  audience: 'unisex',
  measurement: 'body',
  notes: '',
  sourceTitle: 'Hersteller',
  sourceUrl: 'https://example.com/sizes',
  reviewedAt: '2026-01-01',
  columns: ['W', 'Bund cm'],
  rows: [['32', '81']],
};
describe('Quellengebundene Größen', () => {
  it('übernimmt ausdrücklich beschriftete Werte ohne Umrechnung', () =>
    expect(readSizeContent(content).rows).toEqual([['32', '81']]));
  it('liest aus Tabellen kopierte Tabulatoren und deutsche Semikolonzeilen', () => {
    expect(parseSizeTable('W\tBund cm', '32\t81\r\n\n34\t86')).toEqual({
      columns: ['W', 'Bund cm'],
      rows: [
        ['32', '81'],
        ['34', '86'],
      ],
    });
    expect(parseSizeTable('W; Bund cm', '32; 81').rows).toEqual([['32', '81']]);
  });
  it.each([
    { rows: [['32']] },
    { columns: ['W', 'W'] },
    { columns: [] },
    { rows: Array.from({ length: 101 }, () => ['32', '81']) },
    { category: 'made-up' },
    { sourceUrl: 'javascript:alert(1)' },
    { reviewedAt: '2026-02-30' },
    { title: ' ' },
  ])('weist ungültige Tabellen ab: %j', (change) =>
    expect(() => readSizeContent({ ...content, ...change })).toThrow(),
  );
  it('akzeptiert vollständigen Leserstatus und weist doppelte Kennungen ab', () => {
    const reference = {
      id: 1,
      version: 1,
      brandId: null,
      brandName: null,
      archived: false,
      published: true,
      hasDraftChanges: false,
      content,
    };
    expect(readSizeReferences([reference])[0].content.title).toBe(content.title);
    expect(() => readSizeReferences([reference, reference])).toThrow();
    expect(() => readSizeReferences([{ ...reference, hasDraftChanges: 'false' }])).toThrow();
  });
});
