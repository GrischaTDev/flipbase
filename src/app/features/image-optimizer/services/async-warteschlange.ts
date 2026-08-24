import { signal } from '@angular/core';

/** Serialisiert asynchrone Aufgaben je Schluessel, ohne andere Schluessel auszubremsen. */
export class SchluesselWarteschlange<TKey> {
  private readonly letzteAufgabe = new Map<TKey, Promise<void>>();
  readonly anzahlAusstehend = signal(0);

  einreihen<T>(schluessel: TKey, aufgabe: () => Promise<T>): Promise<T> {
    this.anzahlAusstehend.update((anzahl) => anzahl + 1);

    const vorher = this.letzteAufgabe.get(schluessel) ?? Promise.resolve();
    const ergebnis = vorher.then(aufgabe);
    const mitAktuellemZaehler = ergebnis.then(
      (wert) => {
        this.anzahlAusstehend.update((anzahl) => anzahl - 1);
        return wert;
      },
      (fehler: unknown) => {
        this.anzahlAusstehend.update((anzahl) => anzahl - 1);
        throw fehler;
      },
    );
    const abgeschlossen = mitAktuellemZaehler.then(
      () => undefined,
      () => undefined,
    );

    this.letzteAufgabe.set(schluessel, abgeschlossen);
    void abgeschlossen.then(() => {
      if (this.letzteAufgabe.get(schluessel) === abgeschlossen) {
        this.letzteAufgabe.delete(schluessel);
      }
    });

    return mitAktuellemZaehler;
  }
}
