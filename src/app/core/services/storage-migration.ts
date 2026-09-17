/**
 * Uebernimmt den Browser-Speicher aus der Zeit vor der Umbenennung.
 *
 * Bis zur Umbenennung auf Flipbase trugen alle Schluessel im Browser das
 * Praefix `reflip_`. Wuerden wir sie einfach umbenennen, verloere jeder
 * bestehende Nutzer beim naechsten Aufruf seine Einstellungen - Design,
 * aktiver Arbeitsbereich, Warenkorb - und, deutlich schlimmer, die auf dem
 * Flohmarkt offline erfassten und noch nicht uebertragenen Eintraege.
 *
 * Deshalb wird beim Start einmalig umgezogen: kopieren, dann den alten
 * Schluessel entfernen. Ein bereits vorhandener neuer Wert wird nie
 * ueberschrieben - er ist der juengere.
 *
 * Der Umzug laeuft bewusst vor dem Start der Anwendung (siehe `main.ts`).
 * Die Dienste lesen ihre Werte teils schon im Konstruktor; liefe der Umzug
 * erst danach, saehen sie einen leeren Speicher.
 */

const ALTES_PRAEFIX = 'reflip_';
const NEUES_PRAEFIX = 'flipbase_';

/** Merkzeichen, damit der Umzug nur ein einziges Mal laeuft. */
const UMZUG_ERLEDIGT = 'flipbase_umzug_erledigt';

export function uebernehmeAltenBrowserSpeicher(speicher: Storage): number {
  if (speicher.getItem(UMZUG_ERLEDIGT)) return 0;

  // Erst alle Schluessel einsammeln: Waehrend des Umzugs veraendert sich der
  // Speicher, und ueber einen sich aendernden Bestand zu laufen ueberspringt
  // Eintraege.
  const alteSchluessel: string[] = [];
  for (let i = 0; i < speicher.length; i++) {
    const schluessel = speicher.key(i);
    if (schluessel && schluessel.startsWith(ALTES_PRAEFIX)) {
      alteSchluessel.push(schluessel);
    }
  }

  let uebernommen = 0;
  for (const alt of alteSchluessel) {
    const wert = speicher.getItem(alt);
    if (wert === null) continue;

    const neu = NEUES_PRAEFIX + alt.slice(ALTES_PRAEFIX.length);
    if (speicher.getItem(neu) === null) {
      speicher.setItem(neu, wert);
      uebernommen++;
    }
    speicher.removeItem(alt);
  }

  speicher.setItem(UMZUG_ERLEDIGT, new Date().toISOString());
  return uebernommen;
}

/**
 * Startet den Umzug, sofern es ueberhaupt einen Browser-Speicher gibt.
 *
 * Faellt still aus, wenn keiner vorhanden ist (Serverseitiges Rendern) oder
 * wenn er gesperrt ist (privater Modus, blockierte Cookies). Ein
 * fehlgeschlagener Umzug darf den Start der Anwendung nie verhindern.
 */
export function uebernehmeAltenBrowserSpeicherWennMoeglich(): void {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return;
    uebernehmeAltenBrowserSpeicher(localStorage);
  } catch {
    // Ohne Speicher startet die Anwendung trotzdem.
  }
}
