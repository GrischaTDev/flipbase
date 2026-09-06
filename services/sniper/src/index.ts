import 'dotenv/config';

import { loadConfig } from './config.js';
import { createHealthState, startHealthServer } from './health.js';
import { createLogger } from './log.js';
import { RequestBudget } from './runtime/budget.js';
import { countingFetch } from './runtime/counting-fetch.js';
import { refreshCategoriesIfDue } from './runtime/refresh-categories.js';
import { QueryScheduler } from './runtime/scheduler.js';
import { CategoryStore } from './store/category.store.js';
import { ListingStore } from './store/listing.store.js';
import { QueryStore } from './store/query.store.js';
import { createSupabaseClient } from './store/supabase.js';
import { VintedCollector } from './vinted/collector.js';
import { sleep, VintedSession } from './vinted/session.js';

const config = loadConfig(process.env);
const log = createLogger();
const client = createSupabaseClient(config);
const sessionOptions = { baseUrl: config.vintedBaseUrl, userAgent: config.userAgent };
const budget = new RequestBudget(config.requestsPerMinute);

// Jede ausgehende Anfrage meldet sich selbst beim Budget - Aufwaermung,
// Katalogabfrage, Wiederholung nach 5xx und Neuaufwaermen nach 401
// gleichermassen. Deshalb bekommen Sitzung UND Sammler dieselbe umschlossene
// fetch-Funktion; wer sie umgeht, zaehlt nicht mit.
const counted = countingFetch(fetch, () => budget.record());
const session = new VintedSession(sessionOptions, counted);

const health = createHealthState(() => budget.usageRatio());
const queries = new QueryStore(client);
const categories = new CategoryStore(client);

const scheduler = new QueryScheduler({
  queries: {
    dueQueries: (now) => queries.dueQueries(now),
    markPolled: (id, status) => queries.markPolled(id, status),
    markSeeded: (id) => queries.markSeeded(id),
    // Der Taktgeber legt eine Abfrage nach drei Fehlern in Folge still. Hier
    // mitzuzaehlen ist die einzige Stelle, an der das sichtbar wird - der
    // Health-Endpunkt meldet es, sonst faellt es niemandem auf.
    deactivate: async (id) => {
      await queries.deactivate(id);
      health.recordDeactivation();
    },
  },
  collector: new VintedCollector(sessionOptions, session, counted),
  listings: new ListingStore(client),
  budget,
  log,
});

// Ein Dienst, den die Ueberwachung nicht erreichen kann, ist schlimmer als
// einer, der gar nicht erst startet: Er sammelt weiter, waehrend jede
// Statusabfrage ins Leere laeuft. Deshalb hier hart abbrechen.
startHealthServer(health, config.healthPort, (error) => {
  log.error('health_server_failed', { port: config.healthPort, reason: error.message });
  process.exit(1);
});

const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info('shutdown_requested', { signal });
    controller.abort();
  });
}

log.info('started', {
  requestsPerMinute: config.requestsPerMinute,
  tickIntervalMs: config.tickIntervalMs,
  healthPort: config.healthPort,
});

while (!controller.signal.aborted) {
  try {
    const now = new Date();

    // Vor dem Sammeln, nicht danach: Faellt das Einlesen aus, soll das Sammeln
    // trotzdem laufen - und die Kategorien sind fuer den naechsten Takt aktuell.
    // Das Abholen der Startseite geht ueber dieselbe gezaehlte fetch-Funktion
    // wie alles andere, sonst zaehlt es nicht gegen das Budget - und es fragt
    // vorher mit `hasCapacity()` um Erlaubnis, genau wie der Taktgeber vor
    // jeder Abfrage. Nur mitzaehlen ohne fragen hiesse: Diese eine Anfrage
    // laesst sich nie verweigern, verbraucht aber das Budget der anderen.
    await refreshCategoriesIfDue(
      {
        store: categories,
        hasCapacity: () => budget.hasCapacity(),
        fetchHomepage: async () => {
          const response = await counted(config.vintedBaseUrl, {
            headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': config.userAgent },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        },
        maxAgeMs: config.categoryMaxAgeMs,
        log,
      },
      now,
    );

    const report = await scheduler.runOnce(now);
    health.recordCycle(report, now);
  } catch (error) {
    // Eine gescheiterte Runde beendet den Dienst nicht. Der naechste Takt
    // versucht es erneut; was dauerhaft kaputt ist, faellt am Health-Endpunkt
    // auf, weil dort die letzte erfolgreiche Runde stehen bleibt.
    log.error('tick_failed', { reason: error instanceof Error ? error.message : String(error) });
  }

  await sleep(config.tickIntervalMs);
}

log.info('stopped');
