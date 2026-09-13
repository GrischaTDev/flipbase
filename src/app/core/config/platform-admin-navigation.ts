export interface SubNavigationItem {
  readonly label: string;
  readonly path: string;
}

/**
 * Die Unterseiten der Administration, wie sie in der Seitenleiste
 * aufklappen. Die Reihenfolge hier ist die Reihenfolge im Menue.
 */
export const PLATFORM_ADMIN_NAVIGATION: readonly SubNavigationItem[] = [
  { label: 'Bewerbungen', path: '/admin/applications' },
  { label: 'Sammelaufträge', path: '/admin/queries' },
  { label: 'Botbetrieb', path: '/admin/operation' },
  { label: 'Kategorieliste', path: '/admin/categories' },
];
