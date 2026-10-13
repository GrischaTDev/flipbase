import type { WorkspaceNavigationIcon } from './workspace-navigation';

export interface EbayNavigationItem {
  readonly path: string;
  readonly label: string;
  readonly icon: WorkspaceNavigationIcon;
}

export const EBAY_WORKSPACE_NAVIGATION: readonly EbayNavigationItem[] = [
  { path: '/marketplaces/ebay/listings', label: 'Inserate', icon: 'tag' },
  { path: '/marketplaces/ebay/orders', label: 'Bestellungen', icon: 'shoppingBag' },
  { path: '/marketplaces/ebay/statistics', label: 'Statistiken', icon: 'barChart' },
  { path: '/marketplaces/ebay/connection', label: 'Kontoverbindung', icon: 'settings' },
];

export function isEbayWorkspaceRoute(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return path === '/marketplaces/ebay' || path.startsWith('/marketplaces/ebay/');
}

export function isEbayNavigationActive(path: string, url: string): boolean {
  const currentPath = url.split(/[?#]/)[0];
  return (
    currentPath === path ||
    currentPath.startsWith(`${path}/`) ||
    (path === '/marketplaces/ebay/listings' && currentPath === '/marketplaces/ebay')
  );
}
