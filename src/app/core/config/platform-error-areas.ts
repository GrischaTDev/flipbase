/**
 * Bereiche des zentralen Fehlerprotokolls (platform_error_events.area). Liegt in core,
 * weil das Admin-Seitenmenü daraus seine Unterpunkte unter „Systemzustand“ bildet.
 */
export type PlatformErrorArea =
  'vinted_sync' | 'vinted_actions' | 'kleinanzeigen' | 'push' | 'feed_bot' | 'app';

export interface PlatformErrorAreaDefinition {
  readonly area: PlatformErrorArea;
  /** Adressteil unter /admin/system/. */
  readonly slug: string;
  readonly label: string;
}

/** Reihenfolge entspricht dem Seitenmenü unter „Systemzustand“. */
export const PLATFORM_ERROR_AREAS: readonly PlatformErrorAreaDefinition[] = [
  { area: 'vinted_sync', slug: 'vinted-sync', label: 'Vinted-Abrufe' },
  { area: 'vinted_actions', slug: 'vinted-actions', label: 'Vinted-Aktionen' },
  { area: 'kleinanzeigen', slug: 'kleinanzeigen', label: 'Kleinanzeigen' },
  { area: 'push', slug: 'push', label: 'Push' },
  { area: 'feed_bot', slug: 'feed-bot', label: 'Feed-Bot' },
  { area: 'app', slug: 'app', label: 'App' },
];

export function platformErrorAreaBySlug(slug: string | null): PlatformErrorAreaDefinition | null {
  return PLATFORM_ERROR_AREAS.find((definition) => definition.slug === slug) ?? null;
}
