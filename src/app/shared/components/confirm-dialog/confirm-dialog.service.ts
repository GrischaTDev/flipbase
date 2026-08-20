import { Injectable, signal } from '@angular/core';

export interface DialogAnfrage {
  /** Ueberschrift, kurz und konkret: "Einkauf loeschen?" */
  titel: string;
  /** Was passiert und was das bedeutet - ganze Saetze. */
  text: string;
  /** Beschriftung der bestaetigenden Schaltflaeche. */
  bestaetigenText?: string;
  /** Beschriftung der abbrechenden Schaltflaeche. */
  abbrechenText?: string;
  /**
   * Kennzeichnet einen nicht umkehrbaren Eingriff. Faerbt die Schaltflaeche rot
   * und legt den Fokus auf Abbrechen statt auf Bestaetigen.
   */
  gefahr?: boolean;
  /** Nur ein Hinweis mit einer Schaltflaeche zum Schliessen, keine Rueckfrage. */
  nurHinweis?: boolean;
}

/**
 * Rueckfragen und Hinweise in einem Dialog der Anwendung statt im Fenster des
 * Browsers.
 *
 * `window.confirm` sperrt den gesamten Browser-Tab, sieht in jedem Browser
 * anders aus, laesst sich nicht gestalten und nennt die Adresse der Seite
 * ("Auf app.flipbase.de wird Folgendes angezeigt") - bei einer Frage, ob Daten
 * geloescht werden sollen, ist das weder vertrauenerweckend noch verstaendlich.
 *
 * Der Dienst haelt bewusst eine einzelne Anfrage: Zwei gleichzeitige
 * Rueckfragen waeren fuer den Nutzer ohnehin nicht zu beantworten.
 *
 * ```ts
 * if (await this.dialog.frage({ titel: 'Einkauf loeschen?', text: '...' })) {
 *   await this.service.delete(id);
 * }
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class ConfirmDialogService {
  readonly anfrage = signal<DialogAnfrage | null>(null);

  private aufloesen: ((bestaetigt: boolean) => void) | null = null;

  /** Stellt eine Rueckfrage und wartet auf die Antwort. */
  frage(anfrage: DialogAnfrage): Promise<boolean> {
    // Eine offene Frage wird als abgelehnt beantwortet, damit ihr Aufrufer
    // nicht ewig wartet, falls doch einmal zwei Fragen aufeinandertreffen.
    this.aufloesen?.(false);

    this.anfrage.set(anfrage);
    return new Promise<boolean>((aufloesen) => {
      this.aufloesen = aufloesen;
    });
  }

  /** Zeigt einen reinen Hinweis mit einer Schaltflaeche zum Schliessen. */
  zeigeHinweis(titel: string, text: string, bestaetigenText = 'Verstanden'): Promise<boolean> {
    return this.frage({ titel, text, bestaetigenText, nurHinweis: true });
  }

  /** Beantwortet die offene Anfrage und schliesst den Dialog. */
  antworte(bestaetigt: boolean): void {
    this.anfrage.set(null);
    this.aufloesen?.(bestaetigt);
    this.aufloesen = null;
  }
}
