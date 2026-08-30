const WINDOW_MS = 60_000;

/**
 * Gleitendes Fenster ueber die letzte Minute. Ohne diese Grenze bremst ein
 * Arbeitsbereich mit vielen Filtern alle anderen aus und das Sperrrisiko
 * waechst ungeplant mit der Kundenzahl.
 *
 * Fenstersemantik: ein Eintrag, der genau WINDOW_MS alt ist, gilt bereits als
 * abgelaufen - das Fenster schliesst nach genau 60 Sekunden (inklusive Grenze).
 *
 * Fragen und Aufzeichnen sind bewusst getrennt (frueher beides in
 * `tryConsume()`): ein Aufruf von `collect()` kann zwischen einer und sechs
 * echte HTTP-Anfragen ausloesen (Session-Aufwaermen, Wiederholungen bei 5xx,
 * Neuaufwaermen bei 401 mit eigener Wiederholung) - ein einzelnes "darf ich"
 * pro Aufruf zaehlt dann viel zu wenig. Der Taktgeber fragt einmal mit
 * `hasCapacity()`, ob ueberhaupt noch Platz ist; jede tatsaechlich
 * abgeschickte Anfrage meldet sich einzeln mit `record()` (siehe
 * `countingFetch` in `counting-fetch.ts`, das genau das an der
 * fetch-Schnittstelle erledigt).
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

  /**
   * Reine Frage: ist im aktuellen Fenster noch Platz fuer eine weitere
   * Anfrage? Zaehlt selbst nichts mit - beliebig oft aufrufen veraendert den
   * Zustand nicht.
   */
  hasCapacity(): boolean {
    this.prune();
    return this.timestamps.length < this.maxPerMinute;
  }

  /**
   * Zeichnet eine tatsaechlich abgeschickte Anfrage auf, bedingungslos. Die
   * Anfrage ist bereits raus - `record()` darf das Fenster deshalb ueber die
   * konfigurierte Obergrenze hinaus fuellen, statt das zu verweigern. Genau
   * das macht `hasCapacity()` danach korrekt ab: sie sieht das Fenster als
   * voll (oder ueberfuellt) an, bis genug Eintraege abgelaufen sind.
   */
  record(): void {
    this.timestamps.push(this.now());
  }

  /**
   * Verhaeltnis von Eintraegen im Fenster zur konfigurierten Obergrenze.
   *
   * Kann groesser als 1 sein: das ist kein Rechenfehler, sondern die
   * Kennzahl zeigt bewusst eine Ueberschreitung an, statt sie bei 1
   * abzuschneiden. Genau dieses Verschleiern eines Wertes ueber der
   * Obergrenze war Teil des urspruenglichen Fehlers - im Protokoll soll eine
   * Ueberschreitung sichtbar bleiben, nicht stillschweigend auf "voll"
   * normalisiert werden.
   */
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
