const WINDOW_MS = 60_000;

/**
 * Gleitendes Fenster ueber die letzte Minute. Ohne diese Grenze bremst ein
 * Arbeitsbereich mit vielen Filtern alle anderen aus und das Sperrrisiko
 * waechst ungeplant mit der Kundenzahl.
 */
export class RequestBudget {
  private readonly timestamps: number[] = [];

  constructor(
    private readonly maxPerMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  tryConsume(): boolean {
    this.prune();
    if (this.timestamps.length >= this.maxPerMinute) return false;

    this.timestamps.push(this.now());
    return true;
  }

  usageRatio(): number {
    this.prune();
    return this.timestamps.length / this.maxPerMinute;
  }

  private prune(): void {
    const cutoff = this.now() - WINDOW_MS;
    while (this.timestamps.length > 0 && this.timestamps[0]! <= cutoff) {
      this.timestamps.shift();
    }
  }
}
