export type PlatformFeatureKey = 'vinted' | 'ebay' | 'kleinanzeigen' | 'vinted_feed';

export interface PlatformFeatureSwitch {
  readonly key: PlatformFeatureKey;
  readonly enabled: boolean;
  readonly maintenanceMessage: string | null;
  readonly updatedAt: string;
}

export interface PlatformFeatureArea {
  readonly key: PlatformFeatureKey;
  readonly label: string;
  /** Einstiegsadresse des Bereichs, auf die "Erneut versuchen" zurückführt. */
  readonly path: string;
}

/** Reihenfolge wie in der Administration. */
export const PLATFORM_FEATURE_AREAS: readonly PlatformFeatureArea[] = [
  { key: 'vinted', label: 'Vinted', path: '/marketplaces/vinted' },
  { key: 'ebay', label: 'eBay', path: '/marketplaces/ebay' },
  { key: 'kleinanzeigen', label: 'Kleinanzeigen', path: '/marketplaces/kleinanzeigen' },
  { key: 'vinted_feed', label: 'Vinted-Feed', path: '/vinted-bot' },
];

export function platformFeatureArea(key: string | null): PlatformFeatureArea | null {
  return PLATFORM_FEATURE_AREAS.find((area) => area.key === key) ?? null;
}
