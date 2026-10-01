import { it as test } from 'vitest';
import { strict as assert } from 'node:assert';
import * as picker from '../../../shared/components/article-picker/article-picker-selection';
import type { ArticlePickerEntry } from '../../../shared/components/article-picker/article-picker.models';
import * as sales from './sale-article-selection';
import type {
  SaleCatalogReference,
  SaleInventoryReference,
  SalePurchaseReference,
} from './sale-article-selection';

const entry = (id: string, extra: Partial<ArticlePickerEntry> = {}): ArticlePickerEntry => ({
  id,
  groupId: 'nike',
  title: 'Nike Tanjun',
  imageKey: id,
  size: '36,5',
  color: 'Schwarz Weiß',
  brand: 'Nike',
  category: 'Schuhe > Sneaker',
  availableQuantity: 1,
  ...extra,
});
const product = (id: string, extra: Partial<SaleCatalogReference> = {}): SaleCatalogReference => ({
  id,
  workspace_id: 'ws',
  title: 'Nike Tanjun',
  tracking_mode: 'quantity',
  variant_group_id: 'nike',
  size: '36,5',
  color: 'Schwarz Weiß',
  ...extra,
});
const item = (
  id: string,
  line: string | null,
  extra: Partial<SaleInventoryReference> = {},
): SaleInventoryReference => ({
  id,
  workspace_id: 'ws',
  title: 'Nike Tanjun',
  purchase_id: 'purchase-a',
  purchase_line_id: line,
  ...extra,
});
const purchases: readonly SalePurchaseReference[] = [
  {
    id: 'purchase-a',
    workspace_id: 'ws',
    purchase_lines: [
      { id: 'line-a', workspace_id: 'ws', purchase_id: 'purchase-a', catalog_product_id: 'size36' },
    ],
  },
  {
    id: 'purchase-b',
    workspace_id: 'ws',
    purchase_lines: [
      { id: 'line-b', workspace_id: 'ws', purchase_id: 'purchase-b', catalog_product_id: 'size37' },
    ],
  },
];

test('gruppiert zwei Größen und erhält ihre exakten IDs', () => {
  const groups = picker.groupArticles([entry('37', { size: '37' }), entry('36', { size: '36,5' })]);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].entries.map((e) => e.id),
    ['36', '37'],
  );
});
test('gruppiert nur anhand gespeicherter Gruppen-IDs, nie anhand des Namens', () => {
  assert.equal(picker.groupArticles([entry('one'), entry('two', { groupId: 'other' })]).length, 2);
});
test('verändert die gelieferten Arrays nicht', () => {
  const entries = Object.freeze([
    Object.freeze(entry('37', { size: '37' })),
    Object.freeze(entry('36')),
  ]);
  picker.groupArticles(entries);
  assert.deepEqual(
    entries.map((e) => e.id),
    ['37', '36'],
  );
});
test('sucht Größe, Farbe und Kennung innerhalb der Varianten', () => {
  const groups = picker.groupArticles([entry('one', { ean: '1234567890123' })]);
  for (const query of ['36,5', 'schwarz', '1234567890123']) {
    assert.equal(
      picker.filterArticleGroups(groups, { query, category: null, brand: null }).length,
      1,
    );
  }
});
test('Brand- und Kategoriefilter müssen dieselbe Variante treffen', () => {
  const groups = picker.groupArticles([
    entry('one'),
    entry('two', { brand: 'Adidas', category: 'Hosen' }),
  ]);
  assert.equal(
    picker.filterArticleGroups(groups, { query: '', category: 'Hosen', brand: 'Nike' }).length,
    0,
  );
});
test('Einkauf ohne Bestandsgrenze bleibt auswählbar', () => {
  assert.equal(picker.isArticleSelectable(entry('a', { availableQuantity: undefined })), true);
});
test('Nullbestand, unbekannte und ungültige Mengen bleiben gesperrt', () => {
  for (const availableQuantity of [0, null, -1, 0.5, Infinity, NaN]) {
    assert.equal(picker.isArticleSelectable(entry('a', { availableQuantity })), false);
  }
});
test('Sperrgrund hat Vorrang vor positiver Menge', () => {
  assert.equal(picker.isArticleSelectable(entry('a', { disabledReason: 'Archiviert' })), false);
});
test('Mehrfachauswahl übernimmt konkrete Varianten genau einmal', () => {
  const entries = [entry('a'), entry('b')];
  let selected = picker.toggleArticleSelection(entries, new Set(), 'a', 'multiple');
  selected = picker.toggleArticleSelection(entries, selected, 'b', 'multiple');
  assert.deepEqual(
    picker.selectedArticles(entries, selected).map((e) => e.id),
    ['a', 'b'],
  );
  selected = picker.toggleArticleSelection(entries, selected, 'a', 'multiple');
  assert.deepEqual([...selected], ['b']);
});
test('Einzelauswahl ersetzt statt mehrere Positionen zu übernehmen', () => {
  const result = picker.toggleArticleSelection(
    [entry('a'), entry('b')],
    new Set(['a']),
    'b',
    'single',
  );
  assert.deepEqual([...result], ['b']);
});
test('veraltete, inzwischen gesperrte Auswahl wird nicht bestätigt', () => {
  assert.deepEqual(
    picker.selectedArticles([entry('a', { availableQuantity: 0 })], new Set(['a', 'missing'])),
    [],
  );
});
test('Sperrung während des Dialogs verhindert erneute Auswahl', () => {
  const result = picker.toggleArticleSelection(
    [entry('a', { availableQuantity: 0 })],
    new Set(),
    'a',
    'multiple',
  );
  assert.equal(result.size, 0);
});
test('Einzelstücke aus allen Einkäufen sind unabhängig vom geöffneten Einkauf auffindbar', () => {
  const items = [item('i-a', 'line-a'), item('i-b', 'line-b', { purchase_id: 'purchase-b' })];
  const result = sales.selectLinkedSaleItems(
    'ws',
    items,
    purchases,
    [product('size36'), product('size37')],
    true,
  );
  assert.deepEqual(
    result.map((i) => i.id),
    ['i-a', 'i-b'],
  );
});
test('keine Detailposition nötig, wenn die Einkaufsliste vollständig geladen ist', () => {
  assert.equal(
    sales.selectLinkedSaleItems('ws', [item('a', 'line-a')], purchases, [product('size36')], true)
      .length,
    1,
  );
});
test('fehlende Positionsverknüpfung wird nicht aus einem ähnlichen Titel erraten', () => {
  assert.equal(
    sales.selectLinkedSaleItems('ws', [item('a', 'missing')], purchases, [product('size36')], true)
      .length,
    0,
  );
});
test('einkaufslose Einzelstücke benötigen keinen geöffneten Einkauf', () => {
  assert.equal(
    sales.selectLinkedSaleItems('ws', [item('a', null, { purchase_id: null })], [], [], false)
      .length,
    1,
  );
});
test('fremde Workspaces werden vor jeder Zuordnung entfernt', () => {
  const result = sales.selectLinkedSaleItems(
    'ws',
    [item('a', null, { workspace_id: 'foreign' })],
    [],
    [],
    true,
  );
  assert.deepEqual(result, []);
  assert.deepEqual(sales.selectLinkedSaleItems(null, [item('b', null)], [], [], true), []);
});
test('eine Position aus anderem Einkauf darf kein Einzelstück freigeben', () => {
  assert.deepEqual(
    sales.selectLinkedSaleItems(
      'ws',
      [item('a', 'line-a', { purchase_id: 'wrong' })],
      purchases,
      [product('size36')],
      true,
    ),
    [],
  );
});
test('fehlender oder archivierter Stammartikel bleibt gesperrt', () => {
  for (const products of [[], [product('size36', { archived_at: '2026-10-01' })]]) {
    assert.deepEqual(
      sales.selectLinkedSaleItems('ws', [item('a', 'line-a')], purchases, products, true),
      [],
    );
  }
});
test('ungeladene Zuordnungen dürfen verknüpfte Einzelstücke nicht freigeben', () => {
  assert.deepEqual(
    sales.selectLinkedSaleItems('ws', [item('a', 'line-a')], purchases, [product('size36')], false),
    [],
  );
});
test('Mengenvarianten behalten Varianten-ID und eigene Verfügbarkeit', () => {
  const entries = sales.buildSaleArticleEntries(
    'ws',
    [product('size36'), product('size37', { size: '37' })],
    [],
    [],
    [{ catalog_product_id: 'size36', available_quantity: 1 }],
    new Set(),
  );
  assert.equal(entries.length, 2);
  const first = entries.find((e) => e.id === 'catalog:size36');
  const other = entries.find((e) => e.id === 'catalog:size37');
  assert.ok(first);
  assert.ok(other);
  assert.equal(first.availableQuantity, 1);
  assert.equal(other.availableQuantity, 0);
  assert.equal(picker.isArticleSelectable(other), false);
});
test('Einzelstück ist kein zusätzlicher Mengenbestand seiner Artikelgruppe', () => {
  const entries = sales.buildSaleArticleEntries(
    'ws',
    [product('size36', { tracking_mode: 'individual' })],
    [item('i-a', 'line-a')],
    purchases,
    [],
    new Set(),
  );
  assert.deepEqual(
    entries.map((e) => e.id),
    ['inventory:i-a'],
  );
  assert.equal(entries[0].size, '36,5');
  assert.equal(entries[0].groupId, 'catalog:nike');
});
test('bereits verwendetes Einzelstück wird im Dialog gesperrt', () => {
  const entries = sales.buildSaleArticleEntries(
    'ws',
    [],
    [item('i-a', null)],
    [],
    [],
    new Set(['inventory:i-a']),
  );
  assert.equal(picker.isArticleSelectable(entries[0]), false);
  assert.match(entries[0].disabledReason ?? '', /bereits/i);
});
test('zwei Bestandspositionen desselben Artikels werden nicht still addiert', () => {
  const entries = sales.buildSaleArticleEntries(
    'ws',
    [product('size36')],
    [],
    [],
    [
      { catalog_product_id: 'size36', available_quantity: 1 },
      { catalog_product_id: 'size36', available_quantity: 1 },
    ],
    new Set(),
  );
  assert.equal(entries[0].availableQuantity, null);
  assert.equal(picker.isArticleSelectable(entries[0]), false);
});
test('Mengenobergrenze berücksichtigt alle anderen Zeilen desselben Verkaufs', () => {
  const lines = [
    { target: 'catalog:a', quantity: 2 },
    { target: 'catalog:a', quantity: 2 },
    { target: 'catalog:b', quantity: 9 },
  ];
  assert.equal(sales.remainingLineQuantity(3, lines, 'catalog:a', 0), 1);
});
test('doppelt erfasstes Einzelstück kann nicht zweimal verkauft werden', () => {
  const lines = [
    { target: 'inventory:a', quantity: 1 },
    { target: 'inventory:a', quantity: 1 },
  ];
  assert.equal(sales.remainingLineQuantity(1, lines, 'inventory:a', 0), 0);
});
test('ungültige Kapazität und ungültige andere Mengen sperren konservativ', () => {
  assert.equal(sales.remainingLineQuantity(NaN, [], 'a', 0), 0);
  assert.equal(sales.remainingLineQuantity(2, [{ target: 'a', quantity: Infinity }], 'a', -1), 0);
});

test('findet einen Artikel auch über den separat gespeicherten Modellnamen', () => {
  const groups = picker.groupArticles([entry('a', { title: 'Sneaker', model: 'Air Max Plus' })]);
  assert.equal(
    picker.filterArticleGroups(groups, { query: 'AIR MAX', category: null, brand: null }).length,
    1,
  );
});

test('übernimmt das Modell der konkreten Mengenvariante für die Suche', () => {
  const entries = sales.buildSaleArticleEntries(
    'ws',
    [product('size36', { title: 'Sneaker', model: 'Tanjun GS' })],
    [],
    [],
    [{ catalog_product_id: 'size36', available_quantity: 1 }],
    new Set(),
  );
  assert.equal(entries[0].model, 'Tanjun GS');
});

test('erhält beim eigenständigen Einzelstück dessen Modell für die Suche', () => {
  const entries = sales.buildSaleArticleEntries(
    'ws',
    [],
    [item('i-a', null, { model: 'Daredevil' })],
    [],
    [],
    new Set(),
  );
  assert.equal(entries[0].model, 'Daredevil');
});

test('verwendet den Stammartikel statt der zuerst geladenen Variante als Gruppentitel', () => {
  const variants = [
    entry('37', { title: 'Nike Tanjun Größe 37' }),
    entry('nike', { title: 'Nike Tanjun' }),
  ];
  const groups = picker.groupArticles(variants);
  assert.equal(groups[0].title, 'Nike Tanjun');
  assert.equal(groups[0].imageKey, 'nike');
});
