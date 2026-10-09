import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { PLATFORM_ADMIN_NAVIGATION } from './platform-admin-navigation';
import { VINTED_BOT_NAVIGATION } from './vinted-bot-navigation';
import {
  DASHBOARD_NAVIGATION,
  IDEAS_NAVIGATION,
  OPERATOR_NAVIGATION,
  SETTINGS_NAVIGATION,
  MASTER_DATA_NAVIGATION,
  WORKSPACE_NAVIGATION_GROUPS,
  isIdeasRoute,
  isNavigationChildActive,
  isNavigationItemActive,
} from './workspace-navigation';

describe('Arbeitsnavigation', () => {
  it('ordnet die Arbeitsbereiche inklusive Tools in fester Reihenfolge', () => {
    assert.deepEqual(
      WORKSPACE_NAVIGATION_GROUPS.map((group) => group.label),
      ['Warenwirtschaft', 'Marktplätze', 'Finanzen', 'Tools'],
    );
    assert.deepEqual(
      WORKSPACE_NAVIGATION_GROUPS.map((group) => group.items.map((item) => item.path)),
      [
        ['/purchases', '/catalog', '/sales'],
        ['/marketplaces/vinted', '/marketplaces/ebay', '/marketplaces/kleinanzeigen'],
        ['/expenses', '/accounting', '/analytics'],
        ['/tools/brand-labels', '/image-optimizer', '/deal-calculator', '/deal-calculator/ebay'],
      ],
    );
  });

  it('haelt ausschliesslich die drei zurueckgestellten Bereiche unter Ideen erreichbar', () => {
    assert.equal(IDEAS_NAVIGATION.label, 'Ideen');
    assert.deepEqual(
      IDEAS_NAVIGATION.items.map((item) => [item.path, item.label]),
      [
        ['/shop', 'Online-Shop'],
        ['/research', 'Preisrecherche'],
        ['/fulfillment', 'Packtisch & Versand'],
      ],
    );
  });

  it('ordnet den Marktplatz-Einträgen ihre Plattform-Schlüssel zu', () => {
    const marketplaceGroup = WORKSPACE_NAVIGATION_GROUPS.find(
      (group) => group.id === 'marketplaces',
    );
    assert.deepEqual(
      marketplaceGroup?.items.map((item) => [item.path, item.platform]),
      [
        ['/marketplaces/vinted', 'vinted'],
        ['/marketplaces/ebay', 'ebay'],
        ['/marketplaces/kleinanzeigen', 'kleinanzeigen'],
      ],
    );
  });

  it('benennt die arbeitsbezogenen Eintraege verstaendlich', () => {
    const items = WORKSPACE_NAVIGATION_GROUPS.flatMap((group) => group.items);
    assert.equal(items.find((item) => item.path === '/catalog')?.label, 'Artikel & Bestand');
    assert.equal(items.find((item) => item.path === '/catalog')?.children, undefined);
    assert.equal(items.find((item) => item.path === '/purchases')?.label, 'Einkäufe');
    assert.equal(items.find((item) => item.path === '/sales')?.label, 'Verkäufe');
    assert.equal(items.find((item) => item.path === '/expenses')?.label, 'Ausgaben');
    assert.equal(items.find((item) => item.path === '/analytics')?.label, 'Auswertungen');
    assert.equal(
      items.find((item) => item.path === '/deal-calculator/ebay')?.label,
      'eBay-Gebührenrechner',
    );
  });

  it('erhaelt jeden Hauptlink genau einmal', () => {
    const paths = [
      DASHBOARD_NAVIGATION,
      ...WORKSPACE_NAVIGATION_GROUPS.flatMap((group) => group.items),
      ...IDEAS_NAVIGATION.items,
      MASTER_DATA_NAVIGATION,
      SETTINGS_NAVIGATION,
      OPERATOR_NAVIGATION,
    ].map((item) => item.path);
    assert.equal(new Set(paths).size, paths.length);
    assert.deepEqual(paths.slice().sort(), [
      '/accounting',
      '/admin',
      '/analytics',
      '/catalog',
      '/dashboard',
      '/deal-calculator',
      '/deal-calculator/ebay',
      '/expenses',
      '/fulfillment',
      '/image-optimizer',
      '/marketplaces/ebay',
      '/marketplaces/kleinanzeigen',
      '/marketplaces/vinted',
      '/master-data',
      '/purchases',
      '/research',
      '/sales',
      '/settings',
      '/shop',
      '/tools/brand-labels',
    ]);
  });

  it('behaelt das Plattform-Admin Untermenü', () => {
    assert.equal(OPERATOR_NAVIGATION.children, PLATFORM_ADMIN_NAVIGATION);
  });

  it('behaelt den Demo-Hinweis ausschliesslich am Online-Shop', () => {
    const demoPaths = IDEAS_NAVIGATION.items.filter((item) => item.demo).map((item) => item.path);
    assert.deepEqual(demoPaths, ['/shop']);
  });

  it('behaelt Dashboard und Einstellungen ausserhalb der Arbeitsgruppen', () => {
    assert.equal(DASHBOARD_NAVIGATION.path, '/dashboard');
    assert.equal(MASTER_DATA_NAVIGATION.path, '/master-data');
    assert.equal(SETTINGS_NAVIGATION.path, '/settings');
    assert.equal(OPERATOR_NAVIGATION.path, '/admin');
    assert.equal(
      WORKSPACE_NAVIGATION_GROUPS.some((group) =>
        group.items.some((item) =>
          ['/dashboard', '/master-data', '/settings', '/admin'].includes(item.path),
        ),
      ),
      false,
    );
  });
});

describe('Aktive Navigationspfade', () => {
  it('erkennt alle Ideen-Seiten samt Query, Fragment und Unterseiten', () => {
    for (const item of IDEAS_NAVIGATION.items) {
      assert.equal(isIdeasRoute(item.path), true, item.path);
      assert.equal(isIdeasRoute(`${item.path}?query=jacke#ergebnis`), true, item.path);
      assert.equal(isIdeasRoute(`${item.path}/detail`), true, item.path);
    }
  });

  it('ordnet aehnliche Praefixe und fremde Pfade nicht dem Ideenbereich zu', () => {
    for (const path of [
      '/dashboard',
      '/catalog',
      '/research-notes',
      '/shopper',
      '/fulfillment-old',
      '/deal-calculator-v2',
      '/settings?next=/research',
      '/',
    ]) {
      assert.equal(isIdeasRoute(path), false, path);
    }
  });

  it('unterscheidet Deal-Rechner und eBay-Gebührenrechner als eigene Tools', () => {
    const tools = WORKSPACE_NAVIGATION_GROUPS.find((group) => group.id === 'tools')?.items ?? [];
    const deal = tools.find((item) => item.path === '/deal-calculator');
    const ebay = tools.find((item) => item.path === '/deal-calculator/ebay');

    assert.ok(deal);
    assert.ok(ebay);
    assert.equal(isNavigationItemActive(deal, '/deal-calculator'), true);
    assert.equal(isNavigationItemActive(deal, '/deal-calculator/ebay'), false);
    assert.equal(isNavigationItemActive(ebay, '/deal-calculator/ebay'), true);
  });

  it('markiert Katalog und Bestandsdetails als Artikelbereich', () => {
    const article = WORKSPACE_NAVIGATION_GROUPS.flatMap((group) => group.items).find(
      (item) => item.path === '/catalog',
    );
    assert.ok(article);
    for (const path of [
      '/catalog',
      '/catalog/new',
      '/catalog/123?edit=true',
      '/inventory',
      '/inventory/123#bilder',
    ]) {
      assert.equal(isNavigationItemActive(article, path), true, path);
    }
    assert.equal(isNavigationItemActive(article, '/inventory-old'), false);
    assert.equal(isNavigationItemActive(article, '/purchases'), false);
  });

  it('aktiviert normale Bereiche nur an vollstaendigen Pfadsegmenten', () => {
    assert.equal(isNavigationItemActive(SETTINGS_NAVIGATION, '/settings/account?tab=1'), true);
    assert.equal(isNavigationItemActive(SETTINGS_NAVIGATION, '/settings-old'), false);
    assert.equal(isNavigationItemActive(DASHBOARD_NAVIGATION, '/sales'), false);
  });

  it('markiert bei Bot-Unterseiten nicht gleichzeitig die Bot-Startseite', () => {
    for (const path of ['/vinted-bot', '/vinted-bot/filters', '/vinted-bot/favorites']) {
      const active = VINTED_BOT_NAVIGATION.filter((child) => isNavigationChildActive(child, path));
      assert.deepEqual(
        active.map((child) => child.path),
        [path],
      );
    }
    assert.equal(
      isNavigationChildActive(VINTED_BOT_NAVIGATION[1], '/vinted-bot/filters?sort=asc'),
      true,
    );
    assert.equal(
      isNavigationChildActive(VINTED_BOT_NAVIGATION[1], '/vinted-bot/filters-old'),
      false,
    );
  });

  it('markiert den administrativen Bot-Eintrag auf tieferliegenden Seiten', () => {
    const active = PLATFORM_ADMIN_NAVIGATION.filter((child) =>
      isNavigationChildActive(child, '/admin/vinted-bot/operation#status'),
    );
    assert.deepEqual(
      active.map((child) => child.path),
      ['/admin/vinted-bot'],
    );
  });
});
