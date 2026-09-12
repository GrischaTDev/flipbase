import type { Logger } from '../log.js';

/** Kleine Bereinigungspakete; Fehler bleiben bis zum erfolgreichen Versuch sichtbar. */
export class ListingRetention {
  private nextAttemptAt = 0;
  private running = false;
  error: string | null = null;

  constructor(
    private readonly purge: () => Promise<number>,
    private readonly log: Logger,
    private readonly clock: () => number = Date.now,
  ) {}

  async runIfDue(): Promise<void> {
    if (this.running || this.clock() < this.nextAttemptAt) return;
    this.running = true;
    let retryDelayMs = 60_000;
    try {
      const deleted = await this.purge();
      this.error = null;
      // Volles Paket: Rueckstand im naechsten Sammeltakt weiter abbauen.
      // Sonst koennte der Zulauf schneller sein als ein Paket pro Minute.
      if (deleted >= 1000) retryDelayMs = 0;
      if (deleted > 0) this.log.info('listings_expired', { deleted, retentionDays: 30 });
    } catch {
      this.error = 'Alte Artikel konnten nicht bereinigt werden. Der Dienst versucht es erneut.';
      this.log.error('listing_retention_failed', { reason: this.error });
    } finally {
      this.nextAttemptAt = this.clock() + retryDelayMs;
      this.running = false;
    }
  }
}
