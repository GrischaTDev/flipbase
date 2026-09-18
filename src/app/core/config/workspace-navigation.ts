import { ARTICLE_VIEWS, isArticleRoute } from './article-navigation';
import { PLATFORM_ADMIN_NAVIGATION } from './platform-admin-navigation';
import type { SubNavigationItem } from './platform-admin-navigation';
import { VINTED_BOT_NAVIGATION } from './vinted-bot-navigation';

export type WorkspaceNavigationIcon =
  | 'dashboard'
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
    id: 'purchasing',
    labelKey: 'NAV.GROUP_PURCHASING',
    label: 'Einkauf',
    items: [
      { path: '/purchases', labelKey: 'NAV.PURCHASES', label: 'Einkäufe', icon: 'shoppingBag' },
      { path: '/sellers', labelKey: 'NAV.SELLERS', label: 'Verkäufer', icon: 'users' },
      {
        path: '/vinted-bot',
        labelKey: 'NAV.DEAL_MONITOR',
        label: 'Vinted Bot',
        icon: 'bot',
        children: VINTED_BOT_NAVIGATION,
      },
    ],
  },
  {
    id: 'articles',
    labelKey: 'NAV.GROUP_ARTICLES',
    label: 'Artikel',
    items: [
      {
        path: '/catalog',
        labelKey: 'NAV.ARTICLE_OVERVIEW',
        label: 'Artikelübersicht',
        icon: 'bookOpen',
        children: ARTICLE_VIEWS,
      },
      {
        path: '/image-optimizer',
        labelKey: 'NAV.IMAGE_OPTIMIZER',
        label: 'Bildoptimierer',
        icon: 'image',
      },
    ],
  },
  {
    id: 'selling',
    labelKey: 'NAV.GROUP_SELLING',
    label: 'Verkauf',
    items: [
      {
        path: '/listings',
        labelKey: 'NAV.CREATE_LISTING',
        label: 'Inserate erstellen',
        icon: 'tag',
      },
      { path: '/sales', labelKey: 'NAV.SALES', label: 'Verkäufe', icon: 'trendingUp' },
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
      path: '/deal-calculator',
      labelKey: 'NAV.CALCULATION',
      label: 'Kalkulation',
      icon: 'calculator',
    },
    {
      path: '/fulfillment',
      labelKey: 'NAV.FULFILLMENT',
      label: 'Packtisch & Versand',
      icon: 'truck',
    },
  ],
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
  return isWithinPath(item.path, url);
}

export function isNavigationChildActive(child: SubNavigationItem, url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  if (path === child.path) return true;
  // Die Bot-Startseite ist ein eigener Unterpunkt, kein Sammelpunkt für seine Geschwister.
  if (child.path === '/vinted-bot') return false;
  return path.startsWith(child.path + '/');
}

export function isIdeasRoute(url: string): boolean {
  return IDEAS_NAVIGATION.items.some((item) => isWithinPath(item.path, url));
}

function isWithinPath(target: string, url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return path === target || path.startsWith(target + '/');
}
