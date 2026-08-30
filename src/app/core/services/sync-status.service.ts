import { Injectable, computed, signal } from '@angular/core';

/** Ein Vorgang, der nicht in die Datenbank geschrieben werden konnte. */
export interface SyncFehler {
  /** Laufende Kennung, damit Meldungen gezielt geschlossen werden koennen. */
  readonly id: number;
  /** Was der Nutzer tun wollte, in seiner Sprache. Zum Beispiel "Einkauf speichern". */
  readonly vorgang: string;
  /** Verstaendliche Ursache. */
  readonly meldung: string;
  /** Technische Fehlerkennung, falls vorhanden. */
  readonly code?: string;
  readonly zeitpunkt: string;
  /** Kennung einer zusammengehörigen Nutzeraktion, falls vorhanden. */
  readonly aktionsId?: number;
  /** Stabiler, fachlich normalisierter Schlüssel zur Batch-Deduplizierung. */
  readonly deduplizierungsSchluessel: string;
}

/** Kennzeichnet mehrere technische Vorgänge als eine Nutzeraktion. */
export interface SyncFehlerAktion {
  readonly id: number;
}

interface AktiveFehlerAktion {
  readonly geseheneSchluessel: Set<string>;
  readonly ersteFehler: Map<string, SyncFehler>;
}

/** Fehler, der bereits als Sync-Status sichtbar gemacht wurde. */
export class ZentralGemeldeterFehler extends Error {
  constructor(
    readonly syncFehler: SyncFehler,
    options?: ErrorOptions,
  ) {
    super(`${syncFehler.vorgang} fehlgeschlagen: ${syncFehler.meldung}`, options);
    this.name = 'ZentralGemeldeterFehler';
  }
}

/**
 * Sammelt fehlgeschlagene Schreibvorgänge und macht sie in der Oberfläche sichtbar.
 *
 * Hintergrund: Die Services haben Datenbankfehler bisher nur mit `console.error`
 * protokolliert und der Oberfläche trotzdem Erfolg gemeldet. Ein Einkauf
 * erschien dann in der Liste, stand aber nicht in der Datenbank – und war beim
 * nächsten Neuladen spurlos verschwunden. Für ein Werkzeug, das Einkäufe und
 * Buchhaltung führt, ist das der schlimmste mögliche Ausgang.
 */
@Injectable({
  providedIn: 'root',
})
export class SyncStatusService {
  private naechsteId = 1;
  private naechsteAktionsId = 1;
  private readonly aktiveFehlerAktionen = new Map<number, AktiveFehlerAktion>();

  /**
   * Fehlercodes, die bedeuten können: Die Anmeldung gilt nicht mehr.
   *
   * `42501` kommt, wenn eine Abfrage **ohne** Token durchgeht und damit als
   * `anon` läuft – die Rolle darf nichts. `PGRST301` und `PGRST303` melden ein
   * unlesbares oder abgelaufenes Token.
   *
   * `42501` kann allerdings genauso ein echter Rechte-Fehler sein. Hier wird
   * deshalb nur Bescheid gesagt; ob wirklich abgemeldet wird, entscheidet der
   * `AuthService` nach einer Nachfrage beim Server.
   */
  private static readonly SITZUNGS_CODES = new Set(['42501', 'PGRST301', 'PGRST303']);

  private beiVerdacht: (() => void) | null = null;

  /** Alle offenen, noch nicht weggeklickten Fehler. */
  readonly fehler = signal<SyncFehler[]>([]);

  readonly hatFehler = computed<boolean>(() => this.fehler().length > 0);
  readonly anzahl = computed<number>(() => this.fehler().length);

  /** Der jüngste Fehler – für eine kompakte Anzeige im Header. */
  readonly neuesterFehler = computed<SyncFehler | null>(() => this.fehler()[0] ?? null);

  /**
   * Meldet einen fehlgeschlagenen Schreibvorgang.
   *
   * @param vorgang Was versucht wurde, aus Sicht des Nutzers formuliert.
   * @param ursache Der Fehler von Supabase oder eine geworfene Ausnahme.
   * @returns Ein `Error` mit verständlichem Text, den der Aufrufer zurückgeben kann.
   */
  melde(vorgang: string, ursache: unknown, aktion?: SyncFehlerAktion): ZentralGemeldeterFehler {
    const { meldung, code } = this.deute(ursache);
    const deduplizierungsSchluessel = this.deduplizierungsSchluessel(vorgang, code, meldung);
    const aktiveAktion =
      aktion === undefined ? undefined : this.aktiveFehlerAktionen.get(aktion.id);
    const vorhandener = aktiveAktion?.geseheneSchluessel.has(deduplizierungsSchluessel)
      ? aktiveAktion.ersteFehler.get(deduplizierungsSchluessel)
      : undefined;

    if (vorhandener) return new ZentralGemeldeterFehler(vorhandener, { cause: ursache });

    const eintrag: SyncFehler = {
      id: this.naechsteId++,
      vorgang,
      meldung,
      code,
      zeitpunkt: new Date().toISOString(),
      aktionsId: aktion?.id,
      deduplizierungsSchluessel,
    };

    aktiveAktion?.geseheneSchluessel.add(deduplizierungsSchluessel);
    aktiveAktion?.ersteFehler.set(deduplizierungsSchluessel, eintrag);

    // Offene Fehler bleiben bis zum ausdrücklichen Schließen erhalten.
    this.fehler.update((liste) => [eintrag, ...liste]);

    if (code && SyncStatusService.SITZUNGS_CODES.has(code)) {
      this.beiVerdacht?.();
    }

    return new ZentralGemeldeterFehler(eintrag, { cause: ursache });
  }

  /** Erstellt einen eindeutigen Kontext für eine zusammenhängende Nutzeraktion. */
  neueFehlerAktion(): SyncFehlerAktion {
    const aktion = { id: this.naechsteAktionsId++ };
    this.aktiveFehlerAktionen.set(aktion.id, {
      geseheneSchluessel: new Set<string>(),
      ersteFehler: new Map<string, SyncFehler>(),
    });
    return aktion;
  }

  /** Beendet einen Batch und gibt sein internes Deduplizierungsgedächtnis frei. */
  beendeFehlerAktion(aktion: SyncFehlerAktion): void {
    this.aktiveFehlerAktionen.delete(aktion.id);
  }

  /** Prüft die Herkunft ohne Fehlermeldungstexte vergleichen zu müssen. */
  istZentralGemeldet(ursache: unknown): ursache is ZentralGemeldeterFehler {
    return ursache instanceof ZentralGemeldeterFehler;
  }

  /**
   * Hinterlegt, wer benachrichtigt werden will, wenn ein Fehler auf eine
   * beendete Anmeldung hindeutet. Es gibt genau einen Empfänger – den
   * `AuthService`.
   */
  beiSitzungsverdacht(empfaenger: () => void): void {
    this.beiVerdacht = empfaenger;
  }

  verwerfen(id: number): void {
    this.fehler.update((liste) => liste.filter((f) => f.id !== id));
  }

  alleVerwerfen(): void {
    this.fehler.set([]);
  }

  private deduplizierungsSchluessel(
    vorgang: string,
    code: string | undefined,
    meldung: string,
  ): string {
    return JSON.stringify([vorgang, code ?? null, meldung]);
  }

  /** Übersetzt technische Fehler in verständliche Sätze. */
  private deute(ursache: unknown): { meldung: string; code?: string } {
    if (ursache === null || ursache === undefined) {
      return { meldung: 'Unbekannter Fehler.' };
    }

    const objekt = ursache as { code?: string; message?: string };
    const code = typeof objekt.code === 'string' ? objekt.code : undefined;
    const roh = typeof objekt.message === 'string' ? objekt.message : String(ursache);

    switch (code) {
      case '42501':
        return { meldung: 'Keine Berechtigung für diesen Workspace.', code };
      case '23505':
        return { meldung: 'Ein Eintrag mit diesen Daten existiert bereits.', code };
      case '23503':
        return { meldung: 'Ein verknüpfter Datensatz fehlt oder wurde gelöscht.', code };
      case '23502':
        return { meldung: 'Ein Pflichtfeld ist nicht ausgefüllt.', code };
      case '22P02':
        return { meldung: 'Ein Wert hat ein ungültiges Format.', code };
      case 'PGRST116':
      case 'P0002':
        return { meldung: 'Der Datensatz wurde nicht gefunden.', code };
      case 'PGRST204':
      case 'PGRST200':
        return { meldung: 'Die Datenbankstruktur passt nicht zur Anwendung.', code };
      default:
        break;
    }

    if (/failed to fetch|networkerror|load failed/i.test(roh)) {
      return {
        meldung: 'Keine Verbindung zur Datenbank. Läuft der Supabase-Dienst?',
        code,
      };
    }

    return { meldung: roh || 'Unbekannter Fehler.', code };
  }
}
