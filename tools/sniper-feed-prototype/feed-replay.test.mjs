import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FeedDelivery } from './feed-delivery.mjs';
import { collectFeedBatch, FeedReplay, matchesFeed } from './feed-replay.mjs';
import { importVintedSearchLink } from './vinted-search-link.mjs';

const listing = {
  market: 'de',
  id: '1',
  title: 'Carhartt Fleece Herren',
  currency: 'EUR',
  brandId: 362,
  catalogId: 1858,
  sizeId: 209,
  conditionId: 2,
  price: 1800,
  total: 2150,
};

test('übernimmt Vinted-Filter einschließlich wiederholter Kennungen und Dezimalbeträge', () => {
  const filter = importVintedSearchLink(
    'https://www.vinted.de/catalog?catalog%5B%5D=1858&catalog_ids%5B%5D=1858&brand_ids%5B%5D=362&brand_ids%5B0%5D=88&size_ids%5B%5D=209&status_ids%5B%5D=2&search_text=fleece+sherpa&search_text_mode=any&price_from=7.50&price_to=80&currency=EUR&order=newest_first&search_id=123&page=1',
  );
  assert.deepEqual(filter, {
    market: 'de',
    catalogIds: [1858],
    brandIds: [88, 362],
    sizeIds: [209],
    conditionIds: [2],
    colorIds: [],
    materialIds: [],
    terms: 'fleece sherpa',
    termMode: 'any',
    minPrice: 750,
    maxPrice: 8000,
    currency: 'EUR',
    unsupported: [],
  });
});

test('erhält Kategorieseiten und nennt unbekannte einschränkende Suchwerte', () => {
  const filter = importVintedSearchLink(
    'https://www.vinted.fr/catalog/1858-fleece?future_filter=1&utm_source=fixture&material_ids[]=5',
  );
  assert.equal(filter.market, 'fr');
  assert.deepEqual(filter.catalogIds, [1858]);
  assert.deepEqual(filter.materialIds, [5]);
  assert.deepEqual(filter.unsupported, ['future_filter']);
});

test('ein nicht aufgelöster Import startet keine breitere Quellabfrage', async () => {
  const filter = importVintedSearchLink('https://www.vinted.de/catalog?unknown_filter=1');
  assert.equal(matchesFeed(listing, filter), false);
  const result = await collectFeedBatch([{ ...filter, id: 'check-import' }], () =>
    assert.fail('Ungeklärter Filter darf keinen Quellabruf starten'),
  );
  assert.equal(result.size, 0);
});

test('lehnt fremde Ziele, ungültige IDs und widersprüchliche Preise ab', () => {
  for (const link of [
    'https://vinted.de.example.test/catalog',
    'https://example.test@vinted.de/catalog',
    'https://vinted.de/items/1',
    'http://vinted.de/catalog',
    'https://vinted.de/catalog?brand_ids[]=falsch',
    'https://vinted.de/catalog?price_from=80&price_to=7',
    'https://vinted.de/catalog?price_from=7&price_from=9',
  ])
    assert.throws(() => importVintedSearchLink(link));
});

test('prüft Bedingungen, UND/ODER und Ausschlüsse zusätzlich zum Marktplatz', () => {
  const feed = {
    market: 'de',
    brandIds: [362],
    catalogIds: [1858],
    sizeIds: [209],
    conditionIds: [2],
    minPrice: 700,
    maxPrice: 8000,
    terms: 'fleece sherpa',
    termMode: 'any',
    excluded: 'kinder, beschädigt',
  };
  assert.equal(matchesFeed(listing, feed), true);
  assert.equal(matchesFeed(listing, { ...feed, termMode: 'all' }), false);
  assert.equal(matchesFeed({ ...listing, title: 'Fleece Kinder' }, feed), false);
  assert.equal(matchesFeed({ ...listing, market: 'fr' }, feed), false);
  assert.equal(matchesFeed({ ...listing, price: null }, feed), false);
  assert.equal(matchesFeed({ ...listing, conditionId: null }, feed), false);
});

test('bestätigtes Verkäuferland und Vinted-Marktplatz sind unabhängig', () => {
  const feed = { market: 'de', sellerCountries: ['FR'] };
  assert.equal(
    matchesFeed({ ...listing, sellerCountry: 'FR', sellerCountrySource: 'estimate' }, feed),
    false,
  );
  assert.equal(
    matchesFeed({ ...listing, sellerCountry: 'FR', sellerCountrySource: 'history' }, feed),
    false,
  );
  assert.equal(
    matchesFeed({ ...listing, sellerCountry: 'FR', sellerCountrySource: 'confirmed' }, feed),
    true,
  );
  assert.equal(matchesFeed(listing, { ...feed, includeUnknownSellerCountry: true }), true);
});

const sharedFeeds = [
  { id: 'carhartt', market: 'de', brandIds: [362], source: { key: 'carhartt' } },
  { id: 'fleece', market: 'de', brandIds: [362], terms: 'fleece', source: { key: 'carhartt' } },
  { id: 'ralph', market: 'de', brandIds: [88], source: { key: 'ralph' } },
  { id: 'nike', market: 'de', brandIds: [53], source: { key: 'nike' } },
  { id: 'paused', market: 'de', brandIds: [53], paused: true, source: { key: 'unused' } },
];
const sharedItems = [
  listing,
  { ...listing, id: '2', brandId: 362, title: 'Carhartt Hose' },
  { ...listing, id: '3', brandId: 88, title: 'Ralph Lauren' },
  { ...listing, id: '4', brandId: 53, title: 'Nike' },
];

test('ein vollständiger breiter Abruf liefert dieselben Treffer wie drei präzise Quellen', async () => {
  const requests = [];
  const batch = await collectFeedBatch(sharedFeeds, (request) => {
    requests.push(request);
    return Promise.resolve({ items: sharedItems, caughtUp: true });
  });
  assert.deepEqual(requests, [{ market: 'de' }]);
  const byExactSource = {
    carhartt: sharedItems.slice(0, 2),
    ralph: sharedItems.slice(2, 3),
    nike: sharedItems.slice(3),
  };
  for (const feed of sharedFeeds.filter((candidate) => !candidate.paused)) {
    assert.deepEqual(batch.get(feed.id), {
      caughtUp: true,
      items: byExactSource[feed.source.key].filter((item) => matchesFeed(item, feed)),
    });
  }
  assert.equal(batch.has('paused'), false);
});

test('bei unvollständiger breiter Quelle fallen nur belegte präzise Ergebnisse an', async () => {
  const calls = [];
  const batch = await collectFeedBatch(sharedFeeds, ({ filter }) => {
    const key = filter?.key ?? 'broad';
    calls.push(key);
    if (key === 'carhartt') return Promise.resolve({ items: [listing], caughtUp: true });
    return Promise.resolve({ items: [], caughtUp: false });
  });
  assert.deepEqual(calls, ['broad', 'carhartt', 'ralph', 'nike']);
  assert.equal(batch.get('carhartt').items[0].id, '1');
  assert.equal(batch.get('fleece').caughtUp, true);
  assert.equal(batch.get('ralph').caughtUp, false);
});

test('Ordnerwechsel wählt Feeds aus, ohne deren Abrufzustand umzuschalten', () => {
  const replay = new FeedReplay();
  replay.setFeed({ ...sharedFeeds[0], folder: 'Kleidung' });
  replay.setFeed({ ...sharedFeeds[2], folder: 'Marken' });
  assert.deepEqual(
    replay.readFolder('Kleidung').map((x) => x.id),
    ['carhartt'],
  );
  assert.equal(replay.readFolder().length, 2);
  assert.equal(replay.coverage('de'), false);
  replay.markCoverage('de', true);
  assert.equal(replay.coverage('de'), true);
});

test('ersetzt nach Ablauf des Schätzwerts den Countdown durch einen Wartezustand', () => {
  const replay = new FeedReplay();
  for (const [index, delayMs] of [26_000, 27_000, 28_000, 29_000, 33_000].entries()) {
    const id = String(index + 2);
    replay.observe({ ...listing, id, observedAt: 1_000, state: 'preview' });
    replay.observe({ ...listing, id, observedAt: 1_000 + delayMs, state: 'public', canBuy: true });
  }
  replay.setFeed({ id: 'new', market: 'de' });
  replay.observe({ ...listing, observedAt: 40_000, state: 'preview' });
  assert.deepEqual(replay.displayState('de', '1', 41_000), {
    state: 'preview',
    remainingMs: 27_000,
  });
  assert.deepEqual(replay.displayState('de', '1', 68_000), { state: 'preview', remainingMs: null });
  replay.observe({ ...listing, observedAt: 73_000, state: 'public', canBuy: true });
  replay.observe({ ...listing, observedAt: 74_000, state: 'preview' });
  assert.equal(replay.displayState('de', '1', 75_000).state, 'public');
  assert.equal(replay.items('new').find((x) => x.id === '1').firstSeenAt, 40_000);
});

test('liefert bei erneuter Verbindung Deltas oder ein vollständiges Bild nach einer Lücke', () => {
  const delivery = new FeedDelivery({ epoch: 'A', revision: 5, historyLimit: 2 });
  delivery.publish([{ ...listing, state: 'preview' }]);
  const old = delivery.checkpoint();
  delivery.publish([{ ...listing, state: 'public' }]);
  const recent = delivery.checkpoint();
  delivery.publish([{ ...listing, id: '2' }], ['1']);
  assert.deepEqual(
    delivery.resume(recent).events.map((x) => x.removedIds),
    [['1']],
  );
  assert.equal(delivery.resume(old).events.length, 2);
  delivery.publish([{ ...listing, id: '3' }]);
  const snapshot = delivery.resume(old);
  assert.equal(snapshot.events[0].type, 'snapshot');
  assert.deepEqual(
    snapshot.events[0].items.map((x) => x.id),
    ['2', '3'],
  );
  assert.equal(delivery.resume({ ...recent, revision: 4 }).events[0].type, 'snapshot');
  assert.equal(delivery.resume({ ...recent, epoch: 'B' }).events[0].type, 'snapshot');
});

const order = {
  market: 'de',
  id: '1',
  account: 'test-account',
  currency: 'EUR',
  maxTotal: 2300,
  expiresAt: 120_000,
};

test('Pre-Fire im Replay wartet auf bestätigte Kaufbarkeit und sendet höchstens einmal', async () => {
  const replay = new FeedReplay();
  const key = replay.armPurchase(order);
  assert.equal(replay.armPurchase(order), key);
  let buyCalls = 0;
  const purchase = async () => {
    buyCalls++;
    return { orderId: 'fixture-order' };
  };
  replay.observe({ ...listing, observedAt: 1_000, state: 'preview' });
  assert.equal(await replay.checkPurchase(key, 29_000, purchase), 'waiting');
  replay.observe({
    ...listing,
    observedAt: 30_000,
    state: 'public',
    canBuy: true,
    priceVerified: false,
  });
  assert.equal(await replay.checkPurchase(key, 30_100, purchase), 'waiting');
  replay.observe({
    ...listing,
    observedAt: 34_000,
    state: 'public',
    canBuy: true,
    priceVerified: true,
  });
  await Promise.all([
    replay.checkPurchase(key, 34_100, purchase),
    replay.checkPurchase(key, 34_100, purchase),
  ]);
  assert.equal(buyCalls, 1);
  assert.deepEqual(
    replay.purchaseHistory().map((x) => x.orderId),
    ['fixture-order'],
  );
});

test('teurerer oder verfallener Kaufauftrag wird im Replay nicht ausgeführt', async () => {
  const replay = new FeedReplay();
  const key = replay.armPurchase(order);
  const outlet = () => assert.fail('Kein Kauf erlaubt');
  replay.observe({
    ...listing,
    total: 2500,
    observedAt: 35_000,
    state: 'public',
    canBuy: true,
    priceVerified: true,
  });
  assert.equal(await replay.checkPurchase(key, 35_100, outlet), 'review');
  const expired = replay.armPurchase({ ...order, account: 'second', expiresAt: 32_000 });
  assert.equal(await replay.checkPurchase(expired, 35_100, outlet), 'expired');
  assert.deepEqual(replay.purchaseHistory(), []);
});

test('ein unklarer Kauf wird erst durch Bestellabgleich in die Historie übernommen', async () => {
  const replay = new FeedReplay();
  const key = replay.armPurchase(order);
  replay.observe({
    ...listing,
    observedAt: 35_000,
    state: 'public',
    canBuy: true,
    priceVerified: true,
  });
  assert.equal(
    await replay.checkPurchase(key, 36_000, () => Promise.reject(new Error('Timeout'))),
    'unknown',
  );
  assert.equal(
    await replay.checkPurchase(key, 37_000, () => assert.fail('Kein erneuter Kauf')),
    'unknown',
  );
  assert.deepEqual(replay.purchaseHistory(), []);
  assert.equal(replay.reconcilePurchase(key, 'confirmed-order'), 'purchased');
  assert.deepEqual(
    replay.purchaseHistory().map((x) => x.orderId),
    ['confirmed-order'],
  );
});

test('bei einem Landfilter wartet der Kauf auf ein bestätigtes Verkäuferland', async () => {
  const replay = new FeedReplay();
  const key = replay.armPurchase({ ...order, sellerCountries: ['FR'] });
  const publicListing = { ...listing, state: 'public', canBuy: true, priceVerified: true };
  replay.observe({
    ...publicListing,
    observedAt: 34_000,
    sellerCountry: 'FR',
    sellerCountrySource: 'history',
  });
  const buy = () => assert.fail('Unbestätigtes oder unpassendes Land');
  assert.equal(await replay.checkPurchase(key, 34_100, buy), 'waiting');
  replay.observe({
    ...publicListing,
    observedAt: 35_000,
    sellerCountry: 'DE',
    sellerCountrySource: 'confirmed',
  });
  assert.equal(await replay.checkPurchase(key, 35_100, buy), 'review');
});
