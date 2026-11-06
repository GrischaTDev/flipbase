import type { WorkspaceNavigationIcon } from './workspace-navigation';

export interface SubNavigationItem {
  readonly label: string;
  readonly path: string;
}

export interface PlatformAdminNavigationItem extends SubNavigationItem {
  readonly icon: WorkspaceNavigationIcon;
}

/**
 * Die Seiten der Administration. Im Admin-Bereich ersetzt diese Liste die
 * Hauptnavigation der Seitenleiste, wie es die Marktplaetze mit ihrem eigenen
 * Menue tun. Die Reihenfolge hier ist die Reihenfolge im Menue.
 *
 * Alles rund um den Bot steht gebuendelt unter "Vinted Bot"; dessen
 * Unterseiten waehlt man dort im Seitenmenue, nicht hier.
 */
export const PLATFORM_ADMIN_SIDEBAR_NAVIGATION: readonly PlatformAdminNavigationItem[] = [
  { label: 'Übersicht', path: '/admin/overview', icon: 'dashboard' },
  { label: 'Systemzustand', path: '/admin/system', icon: 'activity' },
  { label: 'Bewerbungen', path: '/admin/applications', icon: 'userPlus' },
  { label: 'Nutzer', path: '/admin/users', icon: 'users' },
  { label: 'Vinted Bot', path: '/admin/vinted-bot', icon: 'bot' },
  { label: 'Vinted-Katalog', path: '/admin/vinted-catalog', icon: 'tag' },
  { label: 'Server-Speicher', path: '/admin/server-storage', icon: 'hardDrive' },
  { label: 'Referenzbibliothek', path: '/tools/brand-labels/admin', icon: 'bookOpen' },
];

const PLATFORM_ADMIN_AREA_ROOTS = ['/admin', '/tools/brand-labels/admin'];

/** Liegt die Adresse im Admin-Bereich, der die Seitenleiste austauscht? */
export function isPlatformAdminRoute(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return PLATFORM_ADMIN_AREA_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}
