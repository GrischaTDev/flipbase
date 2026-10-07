import 'dotenv/config';

import { loadConfig } from './config.js';
import { ChromeVintedBrowser } from './browser/vinted-browser.js';
import { BrowserSessionController } from './browser/browser-session.js';
import { createOperatorVerifier, startBrowserApi } from './browser/browser-http-api.js';
import { createHealthState, startHealthServer } from './health.js';
import { createLogger } from './log.js';
import { RequestBudget } from './runtime/budget.js';
import { countingFetch } from './runtime/counting-fetch.js';
import { pacedVintedFetch } from './runtime/paced-vinted-fetch.js';
import { ListingRetention } from './runtime/listing-retention.js';
import { refreshCategoriesIfDue } from './runtime/refresh-categories.js';
import { QueryScheduler } from './runtime/scheduler.js';
import { RequestMetrics } from './runtime/request-metrics.js';
import { VintedConnectionState } from './runtime/vinted-connection-state.js';
import { WatchlistEvaluator } from './runtime/watchlist-evaluator.js';
import { CategoryStore } from './store/category.store.js';
import { ListingStore } from './store/listing.store.js';
import { OriginStateStore } from './store/origin-state.store.js';
import { QueryStore } from './store/query.store.js';
import { createSupabaseClient } from './store/supabase.js';
import { VintedCollector } from './vinted/collector.js';
import { preferIpv6 } from './vinted/network.js';
import { sleep } from './vinted/session.js';
import { ForbiddenError, RateLimitedError, parseRetryAfter } from './vinted/errors.js';

preferIpv6();

const config = loadConfig(process.env);
const log = createLogger();
const client = createSupabaseClient(config);
const sessionOptions = { baseUrl: config.vintedBaseUrl, userAgent: config.userAgent };
const budget = new RequestBudget(config.requestsPerMinute);

// Jede ausgehende Anfrage meldet sich selbst beim Budget - Katalogabfrage,
// Wiederholungen nach 5xx und der getrennte Kategorieabruf gleichermassen.
const metrics = new RequestMetrics();
const browser = new ChromeVintedBrowser(config.vintedBaseUrl, {
  profileDir: config.browserProfileDir,
  cdpPort: config.browserCdpPort,
});
const counted = pacedVintedFetch(
  countingFetch(
    metrics.wrap((input, init) => browser.fetch(input, init)),
    () => budget.record(),
  ),
  {
    minimumIntervalMs: config.requestMinIntervalMs,
    requestTimeoutMs: config.requestTimeoutMs,
  },
);
const vintedConnection = new VintedConnectionState();

const health = createHealthState(() => budget.usageRatio());
const queries = new QueryStore(client);
const originState = new OriginStateStore(client);
const categories = new CategoryStore(client);
const listings = new ListingStore(client);
const collector = new VintedCollector(sessionOptions, counted, sleep, vintedConnection);
const browserSession = new BrowserSessionController({
  baseUrl: config.vintedBaseUrl,
  minimumIntervalMs: config.requestMinIntervalMs,
  browser,
  originState,
  queries,
  listings,
  collector,
  budget,
});
const retention = new ListingRetention(() => listings.purgeExpired(), log);
const evaluator = new WatchlistEvaluator({
  listings: {
    evaluatePending: (batchSize) => listings.evaluatePending(batchSize),
  },
  log,
});

const scheduler = new QueryScheduler({
  queries: {
    dueQueries: (now) => queries.dueQueries(now),
    recordSuccess: (id, now) => queries.recordSuccess(id, now),
    recordFailure: (id, decision, now, revision, cursor) =>
      queries.recordFailure(id, decision, now, revision, cursor),
    markPolled: (id, status) => queries.markPolled(id, status),
    markSeeded: (id) => queries.markSeeded(id),
  },
  originState,
  collector,
  listings,
  budget,
  log,
});

const browserApi = startBrowserApi({
  host: config.browserHost,
  port: config.browserPort,
  session: browserSession,
  verifyOperator: createOperatorVerifier(config),
});
browserApi.on('error', () => {
  log.error('browser_api_failed', { reason: 'Private Browser-API konnte nicht gestartet werden.' });
  process.exit(1);
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
  requestMinIntervalMs: config.requestMinIntervalMs,
  requestTimeoutMs: config.requestTimeoutMs,
  healthPort: config.healthPort,
});

while (!controller.signal.aborted) {
  let cycleError: string | null = null;
  try {
    const now = new Date();

    // Vor dem Sammeln, nicht danach: Faellt das Einlesen aus, soll das Sammeln
    // trotzdem laufen - und die Kategorien sind fuer den naechsten Takt aktuell.
    // Das Abholen der Startseite geht ueber dieselbe gezaehlte fetch-Funktion
    // wie alles andere, sonst zaehlt es nicht gegen das Budget - und es fragt
    // vorher mit `hasCapacity()` um Erlaubnis, genau wie der Taktgeber vor
    // jeder Abfrage. Nur mitzaehlen ohne fragen hiesse: Diese eine Anfrage
    // laesst sich nie verweigern, verbraucht aber das Budget der anderen.
    const report = (await browserSession.runAutomatic(async () => {
      await refreshCategoriesIfDue(
        {
          store: categories,
          originState,
          hasCapacity: () => budget.hasCapacity(),
          fetchHomepage: async () => {
            try {
              const response = await counted(config.vintedBaseUrl);
              const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
              if (response.status === 403 || response.headers.get('cf-mitigated') === 'challenge') {
                throw new ForbiddenError('Vinted refused the category request', {
                  status: response.status,
                  challengeDetected: response.headers.get('cf-mitigated') === 'challenge',
                  retryAfterSeconds,
                });
              }
              if (response.status === 429)
                throw new RateLimitedError(undefined, { retryAfterSeconds });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const html = await response.text();
              if (
                html.includes('challenge-running') ||
                html.includes('<title>Just a moment...</title>')
              ) {
                throw new ForbiddenError('Vinted category challenge detected', {
                  status: response.status,
                  phase: 'body',
                  challengeDetected: true,
                  retryAfterSeconds,
                });
              }
              vintedConnection.recordSuccess();
              return html;
            } catch (error) {
              vintedConnection.recordFailure();
              throw error;
            }
          },
          maxAgeMs: config.categoryMaxAgeMs,
          log,
        },
        now,
      );

      return scheduler.runOnce(now);
    })) ?? {
      polled: 0,
      skippedForBudget: 0,
      newListings: 0,
      seeded: 0,
      failed: 0,
      newHits: 0,
      originPause: { reason: 'interaction_required', until: null },
    };
    health.recordCycle(report, now);
    if (report.failed > 0)
      cycleError = 'Der Sammeldurchlauf enthält Fehler. Bitte Aufträge und Dienstprotokoll prüfen.';
    if (report.originPause) {
      const reason =
        report.originPause.reason === 'forbidden'
          ? 'Vinted hat den Zugriff abgewiesen'
          : report.originPause.reason === 'rate_limited'
            ? 'Vinted begrenzt die Anfragen'
            : 'Der Vinted-Zugang ist pausiert';
      const nextAttempt = report.originPause.until
        ? `${new Date(report.originPause.until).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} Uhr (deutscher Zeit)`
        : 'der nächsten verfügbaren Gelegenheit';
      cycleError =
        report.originPause.reason === 'interaction_required'
          ? 'Manuelle Prüfung erforderlich. Öffne die Botsitzung im Adminbereich. Der Bot bleibt bis zum bestätigten Katalogzugriff pausiert.'
          : `${reason}. Automatische Wiederprüfung ab ${nextAttempt}.`;
    }
  } catch (error) {
    // Eine gescheiterte Runde beendet den Dienst nicht. Der naechste Takt
    // versucht es erneut; was dauerhaft kaputt ist, faellt am Health-Endpunkt
    // auf, weil dort die letzte erfolgreiche Runde stehen bleibt.
    cycleError = error instanceof Error ? error.message : String(error);
    log.error('tick_failed', { reason: cycleError });
  }

  // Merkzettel-Bewertung laeuft eigenstaendig und unbeeinflusst von Vinted-Fehlern
  await evaluator.runOnce();

  // Eigene Fehlergrenze: Eine fehlende Statusmeldung darf das Sammeln nicht stoppen.
  await retention.runIfDue();
  try {
    const snapshot = metrics.snapshot();
    const connection = vintedConnection.snapshot();
    const { error } = await client.from('sniper_runtime_status').upsert({
      id: 1,
      reported_at: new Date().toISOString(),
      search_filter_version: 1,
      search_filter_reported_at: new Date().toISOString(),
      requests_last_minute: snapshot.requests,
      rejected_last_minute: snapshot.rejected,
      request_budget: config.requestsPerMinute,
      last_cycle_error: cycleError ?? retention.error,
      vinted_connected_since: connection.connectedSince?.toISOString() ?? null,
      vinted_last_success_at: connection.lastSuccessAt?.toISOString() ?? null,
    });
    if (error) throw error;
  } catch {
    log.error('runtime_status_failed', {
      reason: 'Betriebsmeldung konnte nicht gespeichert werden',
    });
  }

  await sleep(config.tickIntervalMs);
}

await browser.close();
browserApi.close();
log.info('stopped');
