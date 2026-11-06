/**
 * Betreiberschalter fuer den Vinted-Feed (public.platform_feature_switches,
 * Bereich "vinted_feed").
 *
 * Ein Lesefehler gilt als eingeschaltet: Ein kurzer Datenbankaussetzer soll das
 * Sammeln nicht anhalten. Ein bewusst gesetztes "aus" greift spaetestens nach
 * cacheMs.
 */
export class FeedOperatorSwitch {
  private cached: { enabled: boolean; readAt: number } | null = null;

  constructor(
    private readonly read: () => Promise<boolean | null>,
    private readonly cacheMs = 15_000,
    private readonly now: () => number = Date.now,
  ) {}

  async isEnabled(): Promise<boolean> {
    const now = this.now();
    if (this.cached && now - this.cached.readAt < this.cacheMs) return this.cached.enabled;
    let enabled: boolean;
    try {
      enabled = (await this.read()) !== false;
    } catch {
      enabled = true;
    }
    this.cached = { enabled, readAt: now };
    return enabled;
  }
}

export const FEED_SWITCHED_OFF_MESSAGE =
  'Der Vinted-Feed ist in der Administration abgeschaltet. Der Bot sammelt keine neuen Angebote.';
