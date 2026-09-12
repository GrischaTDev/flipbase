import { createServer, type Server } from 'node:http';

import type { CycleReport } from './runtime/scheduler.js';

export interface HealthSnapshot {
  ready: boolean;
  lastSuccessfulCycleAt: string | null;
  budgetUsageRatio: number;
  deactivatedQueries: number;
}

export interface HealthState {
  recordCycle(report: CycleReport, now: Date): void;
  recordDeactivation(): void;
  snapshot(): HealthSnapshot;
}

/**
 * Der Betriebszustand des Dienstes, so wie ihn `/health` ausliefert.
 *
 * `ready` heisst: Es gab mindestens eine Runde, in der wirklich etwas
 * abgefragt wurde und nicht alles fehlschlug. Eine spaetere Runde ohne
 * faellige Abfrage aendert daran nichts - keine Arbeit ist kein Fehler,
 * sonst meldete sich ein gesunder Dienst in ruhigen Minuten als krank.
 *
 * Die Budgetauslastung wird bei jedem Abruf frisch geholt statt gespeichert:
 * Sie bezieht sich auf ein gleitendes Minutenfenster und waere als Momentwert
 * schon beim Ablegen veraltet.
 */
export function createHealthState(budgetUsageRatio: () => number): HealthState {
  let lastSuccessfulCycleAt: string | null = null;
  let deactivatedQueries = 0;

  return {
    recordCycle(report: CycleReport, now: Date): void {
      if (report.polled > 0 && report.polled > report.failed) {
        lastSuccessfulCycleAt = now.toISOString();
      }
    },

    recordDeactivation(): void {
      deactivatedQueries += 1;
    },

    snapshot(): HealthSnapshot {
      return {
        ready: lastSuccessfulCycleAt !== null,
        lastSuccessfulCycleAt,
        budgetUsageRatio: budgetUsageRatio(),
        deactivatedQueries,
      };
    },
  };
}

/**
 * `/live` prueft den laufenden Prozess, `/health` die erste erfolgreiche Suche.
 * Ohne Suchauftraege kann der Dienst bereits Kategorien einlesen, obwohl
 * `/health` noch 503 meldet. Docker prueft deshalb ausschliesslich `/live`.
 *
 * Vor der ersten erfolgreichen Runde antwortet er mit 503 - eine
 * Startueberwachung soll den Dienst erst dann als bereit ansehen, wenn er
 * wirklich einmal gearbeitet hat.
 */
export function startHealthServer(
  state: HealthState,
  port: number,
  onError: (error: Error) => void,
): Server {
  const server = createServer((request, response) => {
    if (request.url === '/live') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ live: true }));
      return;
    }
    if (request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }

    const snapshot = state.snapshot();
    response.writeHead(snapshot.ready ? 200 : 503, { 'content-type': 'application/json' });
    response.end(JSON.stringify(snapshot));
  });

  // Ohne diesen Handler bindet Node auf einem belegten Port still an einen
  // anderen Netzwerkstapel: Der Dienst laeuft dann scheinbar, aber `/health`
  // antwortet nie - und eine Ueberwachung haelt ihn faelschlich fuer gesund
  // oder startet ihn endlos neu. Genau das ist am 02.09.2026 passiert, weil
  // ein fremder Prozess bereits auf 8080 lauschte.
  server.on('error', onError);

  // Ausdruecklich auf allen Adressen: Im Container kommt die Abfrage von
  // aussen, ein Bindung nur an localhost waere dort unerreichbar.
  server.listen(port, '0.0.0.0');

  // Ein offener Server darf den Prozess nicht am Beenden hindern; das
  // Herunterfahren steuert der Taktgeber.
  server.unref();
  return server;
}
