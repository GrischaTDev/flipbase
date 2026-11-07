import { PLATFORM_ERROR_AREAS } from './platform-error-areas';
import type { WorkspaceNavigationIcon } from './workspace-navigation';

export interface SubNavigationItem {
  readonly label: string;
  readonly path: string;
}

export interface PlatformAdminNavigationItem extends SubNavigationItem {
  readonly icon: WorkspaceNavigationIcon;
  /** Klappt unter dem Eintrag auf, solange einer seiner Pfade geöffnet ist. */
  readonly children?: readonly SubNavigationItem[];
}

/** Systemzustand mit je einer Detailseite für das Fehlerprotokoll eines Bereichs. */
const SYSTEM_HEALTH_NAVIGATION: readonly SubNavigationItem[] = [
  { label: 'Übersicht', path: '/admin/system' },
  ...PLATFORM_ERROR_AREAS.map((area) => ({
    label: area.label,
    path: `/admin/system/${area.slug}`,
  })),
];

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
  {
    label: 'Systemzustand',
    path: '/admin/system',
    icon: 'activity',
    children: SYSTEM_HEALTH_NAVIGATION,
  },
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
