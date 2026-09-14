import type { FetchLike } from '../vinted/session.js';

/**
 * Umschliesst eine `FetchLike`-Funktion so, dass jeder Aufruf genau eine
 * echte Anfrage bei `onRequest()` meldet, bevor er an die eigentliche
 * fetch-Funktion weitergereicht wird - unabhaengig davon, ob diese Anfrage
 * am Ende erfolgreich ist. Eine fehlgeschlagene Anfrage hat die Maschine
 * trotzdem verlassen und zaehlt bei Vinted genauso mit wie eine
 * erfolgreiche; wuerde hier nur der Erfolgsfall gezaehlt, wuerde das Budget
 * ausgerechnet in der Fehlersituation - wenn Vinted schon mit 429/403
 * antwortet - zu wenig zaehlen.
 *
 * Das ist die Stelle, an der `RequestBudget.record()` tatsaechlich
 * aufgerufen wird: `VintedCollector` und der Kategorieabruf bekommen diese
 * umschlossene Funktion statt der rohen `fetch`, damit jede HTTP-Anfrage
 * zaehlt - Katalogabfragen, Wiederholungen bei 5xx und Kategorieabrufe
 * eingeschlossen.
 */
export function countingFetch(fetchFn: FetchLike, onRequest: () => void): FetchLike {
  return (input, init) => {
    onRequest();
    return fetchFn(input, init);
  };
}
