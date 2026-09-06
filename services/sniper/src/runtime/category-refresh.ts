export interface CategorySyncState {
  refreshedAt: string | null;
  requestedAt: string | null;
  lastAttemptAt: string | null;
}

/**
 * Mindestabstand zwischen zwei Versuchen, nachdem einer gescheitert ist.
 *
 * Ohne ihn ist die Auffrischung nach jedem Fehlschlag sofort wieder faellig:
 * `markFailed` schreibt nur `last_attempt_at`, nie `refreshed_at`. Der Dienst
 * ruft die Faelligkeit in jeder Runde seiner Taktschleife auf - bei einem Takt
 * von 5 Sekunden waeren das 12 Anfragen je Minute gegen die Vinted-Startseite,
 * dauerhaft und ausgerechnet in dem Zustand, in dem ohnehin etwas kaputt ist
 * (geaendertes Seitenformat, Netzausfall). Genau der Zustand, in dem Vinted
 * uns aussperrt.
 *
 * Bewusst ein fester Abstand statt exponentiellem Zurueckweichen: Es geht um
 * einen einzigen, taeglich faelligen Vorgang, nicht um eine Warteschlange.
 * Fuenfzehn Minuten bringen die Last von 720 auf 4 Versuche je Stunde und
 * halten den Baum trotzdem hoechstens eine Viertelstunde laenger alt als
 * noetig, sobald Vinted wieder liefert.
 */
export const FAILED_REFRESH_RETRY_MS = 15 * 60 * 1000;

/**
 * Wann der Kategoriebaum neu eingelesen wird.
 *
 * Drei Gruende, und nur diese: Jemand hat in der Administration ausdruecklich
 * angefordert, der letzte Versuch ist gescheitert und die Wartezeit ist um,
 * oder der gespeicherte Stand ist aelter als die Frist.
 *
 * Bewusst in TypeScript entschieden statt in SQL - genauso wie die
 * Faelligkeit einer Abfrage in query.store.ts. So bleibt die Regel ohne
 * Datenbank testbar.
 */
export function isRefreshDue(
  state: CategorySyncState,
  now: Date,
  maxAgeMs: number,
  retryDelayMs: number = FAILED_REFRESH_RETRY_MS,
): boolean {
  const refreshed = millisOf(state.refreshedAt);
  const requested = millisOf(state.requestedAt);
  const attempted = millisOf(state.lastAttemptAt);

  // Eine ausdrueckliche Anforderung greift sofort und geht jedem Rueckzug vor
  // - sonst waere der Knopf in der Administration ausgerechnet dann wirkungs-
  // los, wenn er am dringendsten gebraucht wird.
  //
  // Sie wirkt aber nur einmal: Hat der Dienst seit der Anforderung schon einen
  // Versuch gemacht, ist sie abgearbeitet. Ohne diese zweite Bedingung bliebe
  // eine Anforderung nach einem Fehlschlag offen (`markFailed` ruehrt
  // `refreshed_at` nicht an) und triebe genau das Dauerfeuer, das der Rueckzug
  // verhindern soll.
  if (
    requested !== null &&
    (refreshed === null || requested > refreshed) &&
    (attempted === null || requested > attempted)
  ) {
    return true;
  }

  // Ein Versuch, der juenger ist als der letzte Erfolg, ist ein Fehlschlag:
  // Bei Erfolg setzt `markRefreshed` beide Zeitstempel auf denselben Wert.
  if (attempted !== null && (refreshed === null || attempted > refreshed)) {
    return now.getTime() - attempted >= retryDelayMs;
  }

  if (refreshed === null) return true;

  return now.getTime() - refreshed >= maxAgeMs;
}

function millisOf(timestamp: string | null): number | null {
  return timestamp === null ? null : new Date(timestamp).getTime();
}
