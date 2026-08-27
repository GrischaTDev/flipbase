import { signal } from '@angular/core';

/** Serialisiert asynchrone Aufgaben je Schluessel, ohne andere Schluessel auszubremsen. */
export class KeyedQueue<TKey> {
  private readonly lastTask = new Map<TKey, Promise<void>>();
  readonly pendingCount = signal(0);

  enqueue<T>(schluessel: TKey, aufgabe: () => Promise<T>): Promise<T> {
    this.pendingCount.update((anzahl) => anzahl + 1);

    const vorher = this.lastTask.get(schluessel) ?? Promise.resolve();
    const ergebnis = vorher.then(aufgabe);
    const mitAktuellemZaehler = ergebnis.then(
      (wert) => {
        this.pendingCount.update((anzahl) => anzahl - 1);
        return wert;
      },
      (fehler: unknown) => {
        this.pendingCount.update((anzahl) => anzahl - 1);
        throw fehler;
      },
    );
    const abgeschlossen = mitAktuellemZaehler.then(
      () => undefined,
      () => undefined,
    );

    this.lastTask.set(schluessel, abgeschlossen);
    void abgeschlossen.then(() => {
      if (this.lastTask.get(schluessel) === abgeschlossen) {
        this.lastTask.delete(schluessel);
      }
    });

    return mitAktuellemZaehler;
  }
}
