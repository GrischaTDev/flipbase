export interface SubNavigationItem {
  readonly label: string;
  readonly path: string;
}

/**
 * Die Unterseiten der Administration, wie sie in der Seitenleiste
 * aufklappen. Die Reihenfolge hier ist die Reihenfolge im Menue.
 *
 * Alles rund um den Bot steht gebuendelt unter "Vinted Bot"; dessen
 * Unterseiten waehlt man dort im Seitenmenue, nicht hier.
 */
export const PLATFORM_ADMIN_NAVIGATION: readonly SubNavigationItem[] = [
  { label: 'Bewerbungen', path: '/admin/applications' },
  { label: 'Nutzer', path: '/admin/users' },
  { label: 'Vinted Bot', path: '/admin/vinted-bot' },
];
