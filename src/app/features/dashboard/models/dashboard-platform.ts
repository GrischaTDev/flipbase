export interface DashboardPlatformAppearance {
  readonly key: 'vinted' | 'kleinanzeigen' | 'ebay' | 'other';
  readonly color: string;
  readonly logo: string | null;
}

const appearances: Readonly<Record<string, DashboardPlatformAppearance>> = {
  vinted: {
    key: 'vinted',
    color: 'var(--fb-platform-vinted)',
    logo: '/images/platforms/vinted.svg',
  },
  kleinanzeigen: {
    key: 'kleinanzeigen',
    color: 'var(--fb-platform-kleinanzeigen)',
    logo: '/images/platforms/kleinanzeigen.svg',
  },
  ebay: {
    key: 'ebay',
    color: 'var(--fb-platform-ebay)',
    logo: '/images/platforms/ebay.svg',
  },
};
const other: DashboardPlatformAppearance = {
  key: 'other',
  color: 'var(--fb-platform-other)',
  logo: null,
};

/** Die Plattform bestimmt ihre Farbe, niemals der wechselnde Umsatzrang. */
export function dashboardPlatformAppearance(platform: string): DashboardPlatformAppearance {
  const key = platform.trim().toLowerCase();
  return Object.hasOwn(appearances, key) ? appearances[key] : other;
}
