import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { PLATFORM_ADMIN_NAVIGATION } from './platform-admin-navigation';
import { VINTED_BOT_NAVIGATION } from './vinted-bot-navigation';
import {
  DASHBOARD_NAVIGATION,
  IDEAS_NAVIGATION,
  OPERATOR_NAVIGATION,
  SETTINGS_NAVIGATION,
  WORKSPACE_NAVIGATION_GROUPS,
  isIdeasRoute,
  isNavigationChildActive,
  isNavigationItemActive,
} from './workspace-navigation';

describe('Arbeitsnavigation', () => {
  it('ordnet die Arbeitsbereiche nach Einkauf, Artikel, Verkauf und Finanzen', () => {
    assert.deepEqual(
      WORKSPACE_NAVIGATION_GROUPS.map((group) => group.label),
      ['Einkauf', 'Artikel', 'Verkauf', 'Finanzen'],
    );
    assert.deepEqual(
      WORKSPACE_NAVIGATION_GROUPS.map((group) => group.items.map((item) => item.path)),
      [
        ['/purchases', '/sellers', '/vinted-bot'],
        ['/catalog', '/image-optimizer'],
        ['/listings', '/sales'],
        ['/expenses', '/accounting', '/analytics'],
      ],
    );
  });

  it('haelt ausschliesslich die vier zurueckgestellten Bereiche unter Ideen erreichbar', () => {
    assert.equal(IDEAS_NAVIGATION.label, 'Ideen');
    assert.deepEqual(
      IDEAS_NAVIGATION.items.map((item) => [item.path, item.label]),
      [
        ['/shop', 'Online-Shop'],
        ['/research', 'Preisrecherche'],
        ['/deal-calculator', 'Kalkulation'],
        ['/fulfillment', 'Packtisch & Versand'],
      ],
    );
  });

  it('benennt die arbeitsbezogenen Eintraege verstaendlich', () => {
    const items = WORKSPACE_NAVIGATION_GROUPS.flatMap((group) => group.items);
    assert.equal(items.find((item) => item.path === '/catalog')?.label, 'Artikelübersicht');
    assert.equal(items.find((item) => item.path === '/listings')?.label, 'Inserate');
    assert.equal(items.find((item) => item.path === '/expenses')?.label, 'Ausgaben');
    assert.equal(items.find((item) => item.path === '/analytics')?.label, 'Auswertungen');
  });

  it('erhaelt jeden bisherigen Hauptlink genau einmal', () => {
    const paths = [
      DASHBOARD_NAVIGATION,
      ...WORKSPACE_NAVIGATION_GROUPS.flatMap((group) => group.items),
      ...IDEAS_NAVIGATION.items,
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
      '/expenses',
      '/fulfillment',
      '/image-optimizer',
      '/listings',
      '/purchases',
      '/research',
      '/sales',
      '/sellers',
      '/settings',
      '/shop',
      '/vinted-bot',
    ]);
  });

  it('behaelt die vorhandenen Untermenues unveraendert', () => {
    const bot = WORKSPACE_NAVIGATION_GROUPS[0].items.find((item) => item.path === '/vinted-bot');
    assert.equal(bot?.children, VINTED_BOT_NAVIGATION);
    assert.equal(OPERATOR_NAVIGATION.children, PLATFORM_ADMIN_NAVIGATION);
  });

  it('behaelt den Demo-Hinweis ausschliesslich am Online-Shop', () => {
    const demoPaths = IDEAS_NAVIGATION.items.filter((item) => item.demo).map((item) => item.path);
    assert.deepEqual(demoPaths, ['/shop']);
  });

  it('behaelt Dashboard und Einstellungen ausserhalb der Arbeitsgruppen', () => {
    assert.equal(DASHBOARD_NAVIGATION.path, '/dashboard');
    assert.equal(SETTINGS_NAVIGATION.path, '/settings');
    assert.equal(OPERATOR_NAVIGATION.path, '/admin');
    assert.equal(
      WORKSPACE_NAVIGATION_GROUPS.some((group) =>
        group.items.some((item) => ['/dashboard', '/settings', '/admin'].includes(item.path)),
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

  it('markiert Katalog und Bestandsdetails als Artikelbereich', () => {
    const article = WORKSPACE_NAVIGATION_GROUPS[1].items[0];
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
