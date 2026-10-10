import { isArticleRoute } from './article-navigation';
import { PLATFORM_ADMIN_NAVIGATION } from './platform-admin-navigation';
import type { SubNavigationItem } from './platform-admin-navigation';
import { VINTED_BOT_NAVIGATION } from './vinted-bot-navigation';

export type WorkspaceNavigationIcon =
  | 'dashboard'
  | 'database'
  | 'shoppingBag'
  | 'users'
  | 'bot'
  | 'bookOpen'
  | 'image'
  | 'tag'
  | 'trendingUp'
  | 'receipt'
  | 'barChart'
  | 'store'
  | 'search'
  | 'calculator'
  | 'truck'
  | 'settings'
  | 'shieldCheck';

export interface WorkspaceNavigationItem {
  readonly path: string;
  readonly labelKey: string;
  readonly label: string;
  readonly icon: WorkspaceNavigationIcon;
  readonly platform?: 'vinted' | 'ebay' | 'kleinanzeigen';
  readonly demo?: boolean;
  readonly children?: readonly SubNavigationItem[];
}

export interface WorkspaceNavigationGroup {
  readonly id: string;
  readonly labelKey: string;
  readonly label: string;
  readonly items: readonly WorkspaceNavigationItem[];
}

export const DASHBOARD_NAVIGATION: WorkspaceNavigationItem = {
  path: '/dashboard',
  labelKey: 'NAV.DASHBOARD',
  label: 'Dashboard',
  icon: 'dashboard',
};

/** Die Zuordnung ist explizit und bleibt beim Einfügen neuer Einträge stabil. */
export const WORKSPACE_NAVIGATION_GROUPS: readonly WorkspaceNavigationGroup[] = [
  {
    id: 'merchandise',
    labelKey: 'NAV.GROUP_MERCHANDISE',
    label: 'Warenwirtschaft',
    items: [
      { path: '/purchases', labelKey: 'NAV.PURCHASES', label: 'Einkäufe', icon: 'shoppingBag' },
      {
        path: '/catalog',
        labelKey: 'NAV.ARTICLE_OVERVIEW',
        label: 'Artikel & Bestand',
        icon: 'bookOpen',
      },
      { path: '/sales', labelKey: 'NAV.SALES', label: 'Verkäufe', icon: 'trendingUp' },
    ],
  },
  {
    id: 'marketplaces',
    labelKey: 'NAV.GROUP_MARKETPLACES',
    label: 'Marktplätze',
    items: [
      {
        path: '/marketplaces/vinted',
        labelKey: 'PLATFORMS.VINTED',
        label: 'Vinted',
        icon: 'store',
        platform: 'vinted',
      },
      {
        path: '/vinted-bot',
        labelKey: 'NAV.VINTED_FEED',
        label: 'Vinted Feed',
        icon: 'bot',
        children: VINTED_BOT_NAVIGATION,
      },
      {
        path: '/marketplaces/ebay',
        labelKey: 'PLATFORMS.EBAY',
        label: 'eBay',
        icon: 'store',
        platform: 'ebay',
      },
      {
        path: '/marketplaces/kleinanzeigen',
        labelKey: 'PLATFORMS.KLEINANZEIGEN',
        label: 'Kleinanzeigen',
        icon: 'store',
        platform: 'kleinanzeigen',
      },
    ],
  },
  {
    id: 'finances',
    labelKey: 'NAV.GROUP_FINANCES',
    label: 'Finanzen',
    items: [
      {
        path: '/expenses',
        labelKey: 'NAV.EXPENSES',
        label: 'Ausgaben',
        icon: 'receipt',
      },
      {
        path: '/accounting',
        labelKey: 'NAV.ACCOUNTING',
        label: 'Steuern & DATEV',
        icon: 'receipt',
      },
      { path: '/analytics', labelKey: 'NAV.REPORTS', label: 'Auswertungen', icon: 'barChart' },
    ],
  },
  {
    id: 'tools',
    labelKey: 'NAV.GROUP_TOOLS',
    label: 'Tools',
    items: [
      {
        path: '/tools/brand-labels',
        labelKey: 'NAV.REFERENCE_LIBRARY',
        label: 'Marken & Größen',
        icon: 'bookOpen',
        children: [
          { label: 'Labels vergleichen', path: '/tools/brand-labels' },
          { label: 'Größen nachschlagen', path: '/tools/brand-labels/sizes' },
        ],
      },
      {
        path: '/image-optimizer',
        labelKey: 'NAV.IMAGE_OPTIMIZER',
        label: 'Bildoptimierer',
        icon: 'image',
      },
      {
        path: '/deal-calculator',
        labelKey: 'NAV.DEAL_CALCULATOR',
        label: 'Deal-Rechner',
        icon: 'calculator',
      },
      {
        path: '/deal-calculator/ebay',
        labelKey: 'NAV.EBAY_FEE_CALCULATOR',
        label: 'eBay-Gebührenrechner',
        icon: 'calculator',
      },
    ],
  },
];

/** Zurückgestellte Seiten bleiben erreichbar, ohne den Arbeitsablauf zu überlagern. */
export const IDEAS_NAVIGATION: WorkspaceNavigationGroup = {
  id: 'ideas',
  labelKey: 'NAV.IDEAS',
  label: 'Ideen',
  items: [
    { path: '/shop', labelKey: 'NAV.STORE', label: 'Online-Shop', icon: 'store', demo: true },
    { path: '/research', labelKey: 'NAV.PRICE_RESEARCH', label: 'Preisrecherche', icon: 'search' },
    {
      path: '/fulfillment',
      labelKey: 'NAV.FULFILLMENT',
      label: 'Packtisch & Versand',
      icon: 'truck',
    },
  ],
};

export const MASTER_DATA_NAVIGATION: WorkspaceNavigationItem = {
  path: '/master-data',
  labelKey: 'NAV.MASTER_DATA',
  label: 'Stammdaten',
  icon: 'database',
};

export const SETTINGS_NAVIGATION: WorkspaceNavigationItem = {
  path: '/settings',
  labelKey: 'NAV.SETTINGS',
  label: 'Einstellungen',
  icon: 'settings',
};

/** Sichtbarkeit bleibt Aufgabe der bestehenden Operator-Prüfung in der Sidebar. */
export const OPERATOR_NAVIGATION: WorkspaceNavigationItem = {
  path: '/admin',
  labelKey: 'NAV.PLATFORM_ADMIN',
  label: 'Administration',
  icon: 'shieldCheck',
  children: PLATFORM_ADMIN_NAVIGATION,
};

export function isNavigationItemActive(item: WorkspaceNavigationItem, url: string): boolean {
  if (item.path === '/catalog') return isArticleRoute(url);
  if (item.path === '/deal-calculator') {
    return url.split(/[?#]/, 1)[0] === item.path;
  }
  return isWithinPath(item.path, url);
}

export function isNavigationChildActive(child: SubNavigationItem, url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  if (path === child.path) return true;
  // Die Bot-Startseite ist ein eigener Unterpunkt, kein Sammelpunkt für seine Geschwister.
  if (child.path === '/vinted-bot') return false;
  if (child.path === '/tools/brand-labels')
    return !path.startsWith(child.path + '/sizes') && !path.startsWith(child.path + '/admin');
  return path.startsWith(child.path + '/');
}

export function isIdeasRoute(url: string): boolean {
  return IDEAS_NAVIGATION.items.some((item) => isWithinPath(item.path, url));
}

function isWithinPath(target: string, url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return path === target || path.startsWith(target + '/');
}
