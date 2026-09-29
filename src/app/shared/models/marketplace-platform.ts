export interface MarketplacePlatformAppearance {
  readonly key: 'vinted' | 'kleinanzeigen' | 'ebay' | 'other';
  readonly color: string;
  readonly logo: string | null;
}

const labels: Readonly<Record<string, string>> = {
  ebay: 'eBay',
  vinted: 'Vinted',
  kleinanzeigen: 'Kleinanzeigen',
  direct: 'Direktverkauf',
  custom_store: 'Shop',
};

const appearances: Readonly<Record<string, MarketplacePlatformAppearance>> = {
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

const other: MarketplacePlatformAppearance = {
  key: 'other',
  color: 'var(--fb-platform-other)',
  logo: null,
};

export function marketplacePlatformLabel(value: string): string {
  const key = value.trim().toLowerCase();
  return labels[key] ?? value;
}

/** Die Plattform bestimmt ihre Farbe und ihr Logo, niemals die aktuelle Ansicht oder Sortierung. */
export function marketplacePlatformAppearance(platform: string): MarketplacePlatformAppearance {
  const key = platform.trim().toLowerCase();
  return Object.hasOwn(appearances, key) ? appearances[key] : other;
}
