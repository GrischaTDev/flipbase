import { describe, expect, it } from 'vitest';
import { parseVintedComparisonItemPage } from '../../src/vinted/comparison-item-page.js';

const now = new Date('2026-11-07T12:00:00Z');
const product = (fields: Record<string, unknown> = {}) => ({
  id: '123',
  title: 'Prentis Liner',
  price: { amount: '70', currency_code: 'EUR' },
  photos: [],
  can_buy: true,
  instant_buy: true,
  is_hidden: false,
  is_reserved: false,
  catalog_id: 1858,
  ...fields,
});
const html = (entries: unknown[]) =>
  `<script>self.__next_f.push(${JSON.stringify([1, `1:${JSON.stringify(entries)}\n`])});</script>`;
const attribute = (code: string, value: unknown) => ({ code, data: { value } });
const parse = (entries: unknown[]) => parseVintedComparisonItemPage(html(entries), '123', now);

describe('Vinted comparison item details', () => {
  it('reads compact item data and verified upload intervals only from the matching article', () => {
    const result = parse([
      product(),
      product({
        id: '456',
        title: 'Unrelated',
        price: { amount: '1', currency_code: 'EUR' },
        catalog_id: 9,
      }),
      {
        item_id: '123',
        attributes: [
          attribute('brand', 'Carhartt'),
          attribute('size', 'L'),
          attribute('status', 'Sehr gut'),
          attribute('color', ['Creme', 'Schwarz']),
          attribute('material', 'Polyester'),
          attribute('model', 'Prentis Liner'),
          attribute('upload_date', '2 h'),
        ],
      },
      {
        item_id: '123',
        breadcrumbs: [
          { title: 'Herren', url: '/catalog/5-men' },
          { title: 'Fleece', url: '/catalog/1858-fleece' },
          { title: 'Carhartt', url: '/catalog?brand_ids[]=362' },
        ],
      },
      { item_id: '456', attributes: [attribute('upload_date', '2 Monate')] },
    ]);
    expect(result).toEqual({
      externalId: '123',
      title: 'Prentis Liner',
      price: 70,
      currency: 'EUR',
      brand: 'Carhartt',
      categoryId: '1858',
      categoryPath: ['Herren', 'Fleece'],
      size: 'L',
      condition: 'Sehr gut',
      color: 'Creme, Schwarz',
      material: 'Polyester',
      model: 'Prentis Liner',
      status: 'active',
      publication: {
        earliest: '2026-11-07T09:00:00.000Z',
        latest: '2026-11-07T11:00:00.000Z',
        label: '2 h',
      },
    });
  });

  it('requires article-scoped sold evidence and ignores global translated removed/sold messages', () => {
    const active = parse([
      product(),
      { messages: { sold: 'Verkauft', removed: 'Entfernt!' } },
      { item_id: '456', theme: 'SUCCESS', title: 'Verkauft' },
    ]);
    expect(active.status).toBe('active');
    const sold = parse([
      product({ can_buy: false, instant_buy: false }),
      { item_id: '123', theme: 'SUCCESS', title: 'Verkauft' },
    ]);
    expect(sold.status).toBe('sold');
    expect(sold.title).toBe('Prentis Liner');
  });

  it('does not count hidden, reserved, closed or unexplained unavailable purchase actions as sales', () => {
    for (const flag of ['is_hidden', 'is_reserved', 'is_closed'])
      expect(parse([product({ can_buy: false, instant_buy: false, [flag]: true })]).status).toBe(
        'unknown',
      );
    expect(parse([product({ can_buy: false, instant_buy: false })]).status).toBe('unknown');
    expect(parse([{ item_id: '123', status: 'Verkauft' }]).status).toBe('unknown');
  });

  it('leaves contradictory sold and purchase evidence unknown', () => {
    expect(parse([product(), { item_id: '123', theme: 'SUCCESS', title: 'Verkauft' }]).status).toBe(
      'unknown',
    );
    expect(parse([product(), { item_id: '123', can_buy: false }]).status).toBe('unknown');
    expect(
      parse([
        product({ can_buy: false, instant_buy: false, is_sold: false }),
        { item_id: '123', theme: 'SUCCESS', title: 'Verkauft' },
      ]).status,
    ).toBe('unknown');
  });

  it('does not infer dates from IDs, photos or generic timestamps and rejects conflicting ages', () => {
    expect(
      parse([
        product({
          created_at: '2026-11-07',
          photo: { high_resolution: { timestamp: Date.now() } },
        }),
      ]).publication,
    ).toEqual({ earliest: null, latest: null, label: null });
    expect(
      parse([
        {
          item_id: '123',
          attributes: [attribute('upload_date', '1 Tag'), attribute('upload_date', '8 Wochen')],
        },
      ]).publication,
    ).toEqual({ earliest: null, latest: null, label: null });
    const conflict = parse([product(), product({ price: { amount: '80', currency_code: 'EUR' } })]);
    expect(conflict.price).toBeNull();
    expect(conflict.currency).toBeNull();
  });

  it('rejects missing target records and foreign executable script syntax', () => {
    expect(() => parse([product({ id: '456' })])).toThrow('passenden Artikel');
    expect(() =>
      parseVintedComparisonItemPage('<script>self.__next_f.push(runCode())</script>', '123', now),
    ).toThrow('passenden Artikel');
    expect(() =>
      parseVintedComparisonItemPage(html([product()]), '123', new Date('invalid')),
    ).toThrow('Ungültige Artikelprüfung');
  });

  it('joins chunked React data without evaluating text records or accepting oversized nesting', () => {
    const stream = `1:${JSON.stringify([product()])}\n2:T5,hello\n`;
    const source = [stream.slice(0, 30), stream.slice(30)]
      .map((chunk) => `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`)
      .join('');
    expect(parseVintedComparisonItemPage(source, '123', now).status).toBe('active');
    const nested = '['.repeat(66) + JSON.stringify(product()) + ']'.repeat(66);
    const malformed = `<script>self.__next_f.push(${JSON.stringify([1, `1:${nested}\n`])})</script>`;
    expect(() => parseVintedComparisonItemPage(malformed, '123', now)).toThrow('nesting limit');
  });
});
