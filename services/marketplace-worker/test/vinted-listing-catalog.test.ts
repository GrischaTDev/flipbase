import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserSessionCommands } from '../src/browser-session-commands.ts';
import { isolatedBrowserActions, validateBrowserResult } from '../src/isolated-browser-actions.ts';
import { SupabaseVintedListingCatalogStore } from '../src/supabase-vinted-listing-catalog.ts';
import {
  parseVintedListingCatalogRead,
  parseVintedListingCatalogTree,
  parseVintedListingCategoryAttributes,
  parseVintedListingColors,
  type VintedListingCatalogRead,
} from '../src/vinted-listing-catalog.ts';

// Aufbau wie am 06.11.2026 im angemeldeten Verkaufsformular gemessen (gekürzt).
const catalogs = {
  catalogs: [
    {
      id: 5,
      title: 'Herren',
      path: '',
      full_title: 'Herren',
      restricted_to_status_id: null,
      catalogs: [
        {
          id: 2050,
          title: 'Kleidung',
          full_title: 'Kleidung (Herren)',
          restricted_to_status_id: null,
          catalogs: [
            {
              id: 1819,
              title: 'Gerade geschnittene Jeans',
              full_title: 'Gerade geschnittene Jeans (Herren)',
              restricted_to_status_id: null,
              photo: {},
              badge: null,
              catalogs: [],
            },
            {
              id: 1223,
              title: 'Bomberjacken',
              full_title: 'Bomberjacken (Herren)',
              restricted_to_status_id: null,
              catalogs: [],
            },
          ],
        },
      ],
    },
  ],
};
const attributes = {
  attributes: [
    { id: 1, code: 'brand', value_ids: null, value: null, configuration: null },
    {
      id: 8001,
      code: 'size',
      value_ids: null,
      value: null,
      configuration: {
        title: 'Größe',
        display_type: 'grid',
        selection_type: 'single',
        selection_limit: 1,
        required: true,
        options: [
          {
            id: 14,
            title: 'Größen Männer',
            type: 'group',
            options: [
              { id: 207, title: 'S', type: 'default', has_children: false },
              { id: 208, title: 'M', type: 'default', has_children: false },
            ],
          },
          {
            id: 77,
            title: 'Hosen für Herren',
            type: 'group',
            options: [{ id: 1640, title: 'W32 | DE 48', type: 'default', has_children: false }],
          },
        ],
      },
    },
    {
      id: 3,
      code: 'condition',
      configuration: {
        display_type: 'list',
        selection_type: 'single',
        selection_limit: 1,
        required: true,
        options: [
          {
            id: 1,
            title: 'Zustand',
            type: 'group',
            options: [
              { id: 6, title: 'Neu, mit Etikett', type: 'default' },
              { id: 2, title: 'Sehr gut', type: 'default' },
            ],
          },
        ],
      },
    },
    { id: 4, code: 'color', configuration: null },
    {
      id: 5,
      code: 'material',
      configuration: {
        display_type: 'list',
        selection_type: 'multi',
        selection_limit: 3,
        required: false,
        options: [{ id: 303, title: 'Denim', type: 'default' }],
      },
    },
  ],
};

test('liest den Verkaufsbaum mit Elternpfad, Reihenfolge und Endkategorien', () => {
  const tree = parseVintedListingCatalogTree(catalogs);
  assert.deepEqual(
    tree.map((node) => [node.id, node.parentId, node.path, node.position, node.isLeaf]),
    [
      [5, null, '', 0, false],
      [2050, 5, 'Herren', 0, false],
      [1819, 2050, 'Herren > Kleidung', 0, true],
      [1223, 2050, 'Herren > Kleidung', 1, true],
    ],
  );
  assert.equal(tree[2]?.fullTitle, 'Gerade geschnittene Jeans (Herren)');
  assert.throws(() => parseVintedListingCatalogTree({ catalogs: [] }));
  assert.throws(() =>
    parseVintedListingCatalogTree({
      catalogs: [{ id: 1, title: 'A', catalogs: [{ id: 1, title: 'B', catalogs: [] }] }],
    }),
  );
});

test('übernimmt Größengruppen, gruppierte Zustände und Felder ohne Konfiguration', () => {
  const fields = parseVintedListingCategoryAttributes(attributes);
  assert.deepEqual(
    fields.map((field) => field.code),
    ['brand', 'size', 'condition', 'color', 'material'],
  );
  assert.deepEqual(fields[0], {
    code: 'brand',
    position: 0,
    required: null,
    selectionType: null,
    limit: null,
    display: null,
  });
  assert.deepEqual(fields[1]?.sizeGroups, [
    {
      id: 14,
      title: 'Größen Männer',
      sizes: [
        { id: 207, title: 'S' },
        { id: 208, title: 'M' },
      ],
    },
    { id: 77, title: 'Hosen für Herren', sizes: [{ id: 1640, title: 'W32 | DE 48' }] },
  ]);
  assert.deepEqual(fields[2]?.options, [
    { id: 6, title: 'Neu, mit Etikett' },
    { id: 2, title: 'Sehr gut' },
  ]);
  assert.equal(fields[4]?.limit, 3);
});

test('lehnt Größen ohne Gruppen, doppelte Felder und unbekannte Auswahlarten ab', () => {
  const size = attributes.attributes[1]!;
  assert.throws(() =>
    parseVintedListingCategoryAttributes({
      attributes: [
        {
          ...size,
          configuration: { ...size.configuration!, options: [{ id: 207, title: 'S' }] },
        },
      ],
    }),
  );
  assert.throws(() =>
    parseVintedListingCategoryAttributes({
      attributes: [attributes.attributes[0], attributes.attributes[0]],
    }),
  );
  assert.throws(() =>
    parseVintedListingCategoryAttributes({
      attributes: [
        { ...size, configuration: { ...size.configuration!, selection_type: 'several' } },
      ],
    }),
  );
});

test('sortiert Farben nach Vinteds Reihenfolge und erlaubt leere Farbwerte', () => {
  assert.deepEqual(
    parseVintedListingColors({
      colors: [
        { id: 15, title: 'Bunt', hex: '', order: 2, code: 'VARIOUS' },
        { id: 1, title: 'Schwarz', hex: '000000', order: 1, code: 'BLACK' },
      ],
    }),
    [
      { id: 1, title: 'Schwarz', hex: '000000', code: 'BLACK' },
      { id: 15, title: 'Bunt', hex: '', code: 'VARIOUS' },
    ],
  );
  assert.throws(() =>
    parseVintedListingColors({ colors: [{ id: 1, title: 'X', hex: 'red', order: 1, code: '' }] }),
  );
});

const read: VintedListingCatalogRead = {
  observedAt: '2026-11-06T09:00:00.000Z',
  tree: parseVintedListingCatalogTree(catalogs),
  colors: [{ id: 1, title: 'Schwarz', hex: '000000', code: 'BLACK' }],
  categories: [{ categoryId: 1819, fields: parseVintedListingCategoryAttributes(attributes) }],
};

test('prüft ein Katalogergebnis an der Prozessgrenze verlustfrei erneut', () => {
  assert.deepEqual(parseVintedListingCatalogRead(read), read);
  assert.deepEqual(validateBrowserResult('readListingCatalog', read), read);
  assert.throws(() => parseVintedListingCatalogRead({ ...read, script: 'unexpected' }));
  assert.throws(() =>
    parseVintedListingCatalogRead({ ...read, tree: read.tree?.filter((node) => node.id !== 5) }),
  );
});

test('der abgeschottete Browser nimmt nur gültige Katalogaufträge an', async () => {
  let requests = 0;
  const runtime = new BrowserSessionCommands({
    version: () => 'fixture',
    readListingCatalog: async (account, request, authorize) => {
      assert.equal(account, '123');
      assert.deepEqual(request, { categoryIds: [1819], includeTree: true });
      await authorize();
      requests++;
      return read;
    },
  });
  const browser = isolatedBrowserActions({ request: (input) => runtime.request(input) });
  const authorize = async () => undefined;
  assert.deepEqual(
    await browser.readListingCatalog?.(
      '123',
      { categoryIds: [1819], includeTree: true },
      authorize,
    ),
    read,
  );
  for (const request of [
    { categoryIds: [0], includeTree: false },
    { categoryIds: [1819, 1819], includeTree: false },
    { categoryIds: [1819], includeTree: 'yes' },
    { categoryIds: Array.from({ length: 201 }, (_, index) => index + 1), includeTree: false },
  ])
    await assert.rejects(
      browser.readListingCatalog?.(
        '123',
        request as unknown as { categoryIds: number[]; includeTree: boolean },
        authorize,
      ) ?? Promise.reject(),
    );
  assert.equal(requests, 1);
});

function store(handler: (url: URL, init?: RequestInit) => Response) {
  const calls: { url: URL; body: unknown }[] = [];
  const instance = new SupabaseVintedListingCatalogStore({
    url: 'https://db.example.test',
    serviceRoleKey: 'server-key',
    batchSize: 2,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return handler(url, init);
    },
  });
  return { instance, calls };
}

test('wählt einen fehlenden Baum und Endkategorien ohne oder mit alten Feldern', async () => {
  const empty = store(() => Response.json([]));
  assert.deepEqual(await empty.instance.work(new Date('2026-11-06T10:00:00Z')), {
    includeTree: true,
    categoryIds: [],
  });
  const due = empty.calls[2]!.url.searchParams;
  assert.equal(due.get('is_leaf'), 'eq.true');
  assert.equal(
    due.get('or'),
    '(fields_observed_at.is.null,fields_observed_at.lt.2026-10-30T10:00:00.000Z)',
  );
  assert.equal(due.get('order'), 'fields_observed_at.asc.nullsfirst,id.asc');
  assert.equal(due.get('limit'), '2');

  const current = store((url) =>
    url.searchParams.get('select') === 'tree_observed_at'
      ? Response.json([{ tree_observed_at: '2026-11-05T10:00:00+00:00' }])
      : Response.json([{ id: 1819 }, { id: 1223 }]),
  );
  assert.deepEqual(await current.instance.work(new Date('2026-11-06T10:00:00Z')), {
    includeTree: false,
    categoryIds: [1819, 1223],
  });
  const done = store((url) =>
    url.searchParams.get('select') === 'tree_observed_at'
      ? Response.json([{ tree_observed_at: '2026-11-05T10:00:00+00:00' }])
      : Response.json([]),
  );
  assert.equal(await done.instance.work(new Date('2026-11-06T10:00:00Z')), null);
});

test('liest bei offenem Auftrag alles vor dem Auftrag Gelesene in größeren Blöcken neu', async () => {
  const requested = store((url) =>
    url.pathname.endsWith('vinted_listing_catalog_refreshes')
      ? Response.json([{ requested_at: '2026-11-06T09:00:00+00:00' }])
      : url.searchParams.get('select') === 'tree_observed_at'
        ? Response.json([{ tree_observed_at: '2026-11-06T08:00:00+00:00' }])
        : Response.json([{ id: 1819 }]),
  );
  assert.deepEqual(await requested.instance.work(new Date('2026-11-06T10:00:00Z')), {
    includeTree: true,
    categoryIds: [1819],
    budgetMs: 180_000,
  });
  const due = requested.calls[2]!.url.searchParams;
  assert.equal(
    due.get('or'),
    '(fields_observed_at.is.null,fields_observed_at.lt.2026-11-06T09:00:00.000Z)',
  );
  assert.equal(due.get('limit'), '200');
});

test('speichert Baum, Farben und Felder; eine abgelehnte Kategorie hält den Rest nicht auf', async () => {
  const saved = store((url, init) => {
    const body = JSON.parse(String(init?.body));
    return url.pathname.endsWith('category_fields') && body.p_category_id === 1223
      ? new Response('{}', { status: 400 })
      : Response.json(true);
  });
  const result = await saved.instance.save({
    ...read,
    categories: [...read.categories, { categoryId: 1223, fields: [] }],
  });
  assert.deepEqual(result, { categories: 1, failed: 1 });
  assert.deepEqual(
    saved.calls.map((call) => call.url.pathname.split('/').pop()),
    [
      'marketplace_save_vinted_listing_categories',
      'marketplace_save_vinted_listing_options',
      'marketplace_save_vinted_listing_category_fields',
      'marketplace_save_vinted_listing_category_fields',
    ],
  );
  assert.deepEqual(saved.calls[1]!.body, { p_field_code: 'color', p_options: read.colors });
  assert.equal((saved.calls[2]!.body as Record<string, unknown>)['p_observed_at'], read.observedAt);
});
