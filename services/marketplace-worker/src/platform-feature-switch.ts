export type PlatformFeatureKey = 'vinted' | 'ebay' | 'kleinanzeigen' | 'vinted_feed';

interface PlatformFeatureSwitchOptions {
  url: string;
  serviceRoleKey: string;
  feature: PlatformFeatureKey;
  /** Wie lange ein gelesener Stand gilt, bevor erneut gefragt wird. */
  cacheMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

/**
 * Liest den Betreiberschalter eines Kernbereichs (public.platform_feature_switches).
 *
 * Bei einem Lesefehler gilt der Bereich als eingeschaltet: Ein kurzer
 * Datenbankaussetzer darf den normalen Betrieb nicht anhalten. Ein bewusst
 * gesetztes "aus" greift spätestens nach cacheMs.
 */
export class PlatformFeatureSwitch {
  private readonly options: PlatformFeatureSwitchOptions;
  private cached: { enabled: boolean; readAt: number } | null = null;
  private reading?: Promise<boolean>;

  constructor(options: PlatformFeatureSwitchOptions) {
    this.options = options;
  }

  async isEnabled(): Promise<boolean> {
    const now = (this.options.now ?? Date.now)();
    if (this.cached && now - this.cached.readAt < (this.options.cacheMs ?? 15_000))
      return this.cached.enabled;
    this.reading ??= this.read(now).finally(() => {
      this.reading = undefined;
    });
    return this.reading;
  }

  private async read(now: number): Promise<boolean> {
    const url = new URL('/rest/v1/platform_feature_switches', this.options.url);
    url.searchParams.set('select', 'enabled');
    url.searchParams.set('feature_key', `eq.${this.options.feature}`);
    try {
      const response = await (this.options.fetch ?? fetch)(url, {
        headers: {
          apikey: this.options.serviceRoleKey,
          Authorization: `Bearer ${this.options.serviceRoleKey}`,
          Accept: 'application/json',
        },
      });
      if (!response.ok) return this.remember(true, now);
      const rows: unknown = await response.json();
      const enabled =
        !Array.isArray(rows) ||
        rows.length === 0 ||
        (rows[0] as { enabled?: unknown }).enabled !== false;
      return this.remember(enabled, now);
    } catch {
      return this.remember(true, now);
    }
  }

  private remember(enabled: boolean, readAt: number): boolean {
    this.cached = { enabled, readAt };
    return enabled;
  }
}
