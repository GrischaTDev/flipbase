import type { WorkspaceNavigationIcon } from './workspace-navigation';

export const KLEINANZEIGEN_WORKSPACE_NAVIGATION: readonly {
  readonly path: string;
  readonly label: string;
  readonly icon: WorkspaceNavigationIcon;
}[] = [
  { path: '/marketplaces/kleinanzeigen/overview', label: 'Übersicht', icon: 'dashboard' },
  { path: '/marketplaces/kleinanzeigen/listings', label: 'Inserate', icon: 'tag' },
  { path: '/marketplaces/kleinanzeigen/connection', label: 'Kontoverbindung', icon: 'settings' },
];

export function isKleinanzeigenWorkspaceRoute(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return path === '/marketplaces/kleinanzeigen' || path.startsWith('/marketplaces/kleinanzeigen/');
}

export function isKleinanzeigenNavigationActive(path: string, url: string): boolean {
  const current = url.split(/[?#]/)[0];
  return (
    current === path ||
    current.startsWith(path + '/') ||
    (path === '/marketplaces/kleinanzeigen/overview' && current === '/marketplaces/kleinanzeigen')
  );
}
