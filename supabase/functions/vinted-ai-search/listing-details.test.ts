import { loadListingDetails, parseListingDetails } from './listing-details.ts';
import type { ResearchListing } from './research.ts';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
}

const listing: ResearchListing = {
  id: 'f37236dd-93f4-4fa2-b09e-ab8049631b48',
  url: 'https://www.vinted.de/items/123-giacca-carhartt',
  title: 'Alter Titel aus dem Feed',
  description: 'Feedbeschreibung',
  image_urls: ['https://images1.vinted.net/feed.webp'],
  item_price: 20,
  total_price: 22,
  currency: 'EUR',
  brand: 'Carhartt',
  size: 'L',
  condition: 'Sehr gut',
};

const euro = (amount: string | number) => ({ amount, currency_code: 'EUR' });
const product = (values: Record<string, unknown> = {}) => ({
  id: '123',
  title: 'Giacca Carhartt Prentis Liner',
  price: euro('30'),
  photos: [{ url: 'https://images1.vinted.net/current.webp' }],
  ...values,
});

function htmlFor(entries: unknown[]): string {
  return `<script>self.__next_f.push(${JSON.stringify([1, `1:${JSON.stringify(entries)}\n`])});</script>`;
}

async function load(entries: unknown[], originalListing = listing) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(htmlFor(entries));
  try {
    return await loadListingDetails(originalListing);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test(
  'übernimmt den aktuellen Produkttitel ohne Überschriften oder fremde Inserate zu verwechseln',
  async () => {
    const result = await load([
      product(),
      { item_id: '123', title: 'Ähnliche Artikel', content_source: 'similar_items' },
      { item_id: '123', title: 'Verkauft', theme: 'success' },
      product({ id: '456', title: 'Fremde Jacke', price: euro('500') }),
    ]);
    equal(result.title, 'Giacca Carhartt Prentis Liner');
    equal(result.item_price, 30);
    equal(result.image_urls, ['https://images1.vinted.net/current.webp']);
    equal(result.detailsStatus, 'loaded');
  },
);

Deno.test(
  'kennzeichnet nach einer Preisänderung den unbekannten Gesamtpreis statt alte Gebühren weiterzuverwenden',
  async () => {
    const changed = await load([product()]);
    equal(changed.item_price, 30);
    equal(changed.total_price, null);
    equal(changed.currency, 'EUR');
    const unchanged = await load([product({ price: euro('20') })]);
    equal(unchanged.item_price, 20);
    equal(unchanged.total_price, 22);
    const withoutKnownTotal = await load([product({ price: euro('20') })], {
      ...listing,
      total_price: null,
    });
    equal(withoutKnownTotal.total_price, null);
  },
);

Deno.test(
  'übernimmt ein frisch belegtes EUR-Preispaar gemeinsam aus demselben Produktdatensatz',
  async () => {
    for (const totalField of ['totalItemPrice', 'total_item_price', 'total_price']) {
      const result = await load([product({ [totalField]: euro('32.20') })]);
      equal(result.item_price, 30);
      equal(result.total_price, 32.2);
      equal(result.currency, 'EUR');
    }
    const camelCase = await load([
      product({
        price: { amount: 30, currencyCode: 'EUR' },
        totalItemPrice: { amount: 32.2, currencyCode: 'EUR' },
      }),
    ]);
    equal(camelCase.total_price, 32.2);
  },
);

Deno.test(
  'kombiniert neue Artikelpreise nicht mit Gesamtpreisen anderer Blöcke oder Währungen',
  async () => {
    const unrelated = await load([
      product(),
      { item_id: '123', totalItemPrice: euro('32.20') },
      product({ id: '456', totalItemPrice: euro('32.20') }),
    ]);
    equal(unrelated.item_price, 30);
    equal(unrelated.total_price, null);
    for (const total of [
      euro('29'),
      { amount: '32.20', currency_code: 'USD' },
      euro('NaN'),
      euro('-1'),
    ]) {
      const result = await load([product({ totalItemPrice: total })]);
      equal(result.item_price, 30);
      equal(result.total_price, null);
    }
  },
);

Deno.test(
  'erhält die Feedpreise bei fehlenden, ungültigen oder widersprüchlichen Preisangaben',
  async () => {
    for (const price of [
      null,
      '$151:props:value:price',
      euro('0'),
      euro('-1'),
      euro('Infinity'),
      euro('0x30'),
      euro(100001),
      { amount: '30', currency_code: 'USD' },
    ]) {
      const result = await load([product({ price })]);
      equal(result.item_price, 20);
      equal(result.total_price, 22);
    }
    const conflicting = await load([product(), product({ price: euro('35') })]);
    equal(conflicting.item_price, 20);
    equal(conflicting.total_price, 22);
  },
);

Deno.test('erhält den Feedtitel bei leeren oder widersprüchlichen Produkttiteln', async () => {
  equal((await load([product({ title: '  ' })])).title, listing.title);
  equal((await load([product(), product({ title: 'Anderer Produktname' })])).title, listing.title);
  const withoutMoney = parseListingDetails(
    htmlFor([
      {
        item_id: '123',
        title: 'Ähnliche Artikel',
        photos: [{ url: 'https://images1.vinted.net/current.webp' }],
      },
    ]),
    '123',
  );
  equal(withoutMoney.title, undefined);
  equal(withoutMoney.item_price, undefined);
});
