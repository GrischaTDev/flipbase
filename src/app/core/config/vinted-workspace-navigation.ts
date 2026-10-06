import type { WorkspaceNavigationIcon } from './workspace-navigation';

export interface VintedNavigationItem {
  readonly path: string;
  readonly label: string;
  readonly icon: WorkspaceNavigationIcon;
}

export const VINTED_WORKSPACE_NAVIGATION: readonly VintedNavigationItem[] = [
  { path: '/marketplaces/vinted/accounts', label: 'Konten', icon: 'users' },
  { path: '/marketplaces/vinted/overview', label: 'Übersicht', icon: 'dashboard' },
  { path: '/marketplaces/vinted/messages', label: 'Postfach', icon: 'shoppingBag' },
  { path: '/marketplaces/vinted/favorite-messages', label: 'Favoritennachrichten', icon: 'bot' },
  { path: '/marketplaces/vinted/listings', label: 'Inserate', icon: 'tag' },
  { path: '/marketplaces/vinted/sales', label: 'Verkäufe', icon: 'trendingUp' },
  { path: '/marketplaces/vinted/activity', label: 'Verlauf', icon: 'bookOpen' },
  { path: '/marketplaces/vinted/profile', label: 'Profil', icon: 'store' },
];

export function isVintedWorkspaceRoute(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return path === '/marketplaces/vinted' || path.startsWith('/marketplaces/vinted/');
}

export function isVintedNavigationActive(path: string, url: string): boolean {
  const currentPath = url.split(/[?#]/)[0];
  return (
    currentPath === path ||
    currentPath.startsWith(`${path}/`) ||
    (path === '/marketplaces/vinted/accounts' && currentPath === '/marketplaces/vinted')
  );
}
