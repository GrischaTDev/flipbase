import { SyncStatusService } from './sync-status.service';

/**
 * Schickt einen Schreibbefehl an die Datenbank ab, ohne den Aufrufer
 * aufzuhalten - meldet aber Fehler, statt sie zu verschlucken.
 *
 * **Warum es diese Funktion gibt:** Der Abfrage-Erbauer von supabase-js ist
 * "faul". Er baut die Anfrage erst zusammen und schickt sie ab, wenn jemand
 * auf das Ergebnis wartet - die Ausfuehrung steckt in seiner `then`-Methode.
 * Ein `client.from('x').insert({...})` ohne `await` sendet deshalb **gar
 * nichts**: kein Netzwerkaufruf, keine Fehlermeldung, nichts.
 *
 * Genau so gingen Benachrichtigungen, offline erfasste Flohmarkt-Eintraege,
 * Versandauftraege und Shop-Einstellungen still verloren. Auf dem Bildschirm
 * sah alles richtig aus, weil die Anzeige aus dem Arbeitsspeicher kam - beim
 * naechsten Laden war es weg.
 *
 * Wer auf das Ergebnis angewiesen ist, nimmt weiterhin `await`. Diese Funktion
 * ist fuer Nebensachen gedacht, die den Ablauf nicht aufhalten sollen: eine
 * Meldung wegschreiben, einen Zaehler nachziehen.
 *
 * @param befehl Der Schreibbefehl, zum Beispiel `client.from('x').insert(...)`
 * @param vorgang Klartext fuer die Fehlermeldung, z. B. "Speichern der Meldung"
 * @param syncStatus Dienst fuer die Fehlermeldung; fehlt er, wird still verworfen
 */
export function schreibeImHintergrund(
  befehl: PromiseLike<{ error: unknown } | null | undefined>,
  vorgang: string,
  syncStatus?: SyncStatusService | null,
): void {
  void Promise.resolve(befehl).then(
    (ergebnis) => {
      if (ergebnis?.error) {
        syncStatus?.melde(vorgang, ergebnis.error);
      }
    },
    (fehler: unknown) => {
      syncStatus?.melde(vorgang, fehler);
    },
  );
}
