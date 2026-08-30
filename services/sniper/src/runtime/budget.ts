const WINDOW_MS = 60_000;

/**
 * Gleitendes Fenster ueber die letzte Minute. Ohne diese Grenze bremst ein
 * Arbeitsbereich mit vielen Filtern alle anderen aus und das Sperrrisiko
 * waechst ungeplant mit der Kundenzahl.
 *
 * Fenstersemantik: ein Eintrag, der genau WINDOW_MS alt ist, gilt bereits als
 * abgelaufen - das Fenster schliesst nach genau 60 Sekunden (inklusive Grenze).
 */
export class RequestBudget {
  private readonly timestamps: number[] = [];

  constructor(
    private readonly maxPerMinute: number,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(maxPerMinute) || maxPerMinute <= 0) {
      throw new RangeError(`maxPerMinute must be a positive integer, got ${maxPerMinute}`);
    }
  }

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
    // Reihenfolge-unabhaengig, weil Date.now() nicht garantiert monoton ist
    // (z.B. NTP-Korrektur laesst die Uhr zurueckspringen). Ein Filter behaelt
    // alle nicht abgelaufenen Eintraege, egal in welcher Reihenfolge sie im
    // Array stehen - kein Verlass mehr auf einen sortierten Anfang.
    const cutoff = this.now() - WINDOW_MS;
    let kept = 0;

    for (const timestamp of this.timestamps) {
      if (timestamp > cutoff) {
        this.timestamps[kept] = timestamp;
        kept += 1;
      }
    }

    this.timestamps.length = kept;
  }
}
