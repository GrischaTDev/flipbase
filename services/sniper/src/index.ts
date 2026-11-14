import 'dotenv/config';

import { loadConfig } from './config.js';
import { ChromeVintedBrowser } from './browser/vinted-browser.js';
import { BrowserSessionController } from './browser/browser-session.js';
import { createOperatorVerifier, startBrowserApi } from './browser/browser-http-api.js';
import { createHealthState, startHealthServer } from './health.js';
import { createLogger } from './log.js';
import { startCollectorWatchdog } from './runtime/collector-watchdog.js';
import { RequestBudget } from './runtime/budget.js';
import { RequestStartGuard } from './runtime/request-start-guard.js';
import { pacedVintedFetch } from './runtime/paced-vinted-fetch.js';
import { ListingRetention } from './runtime/listing-retention.js';
import { ComparisonCollection, ComparisonRequestSlots } from './runtime/comparison-collection.js';
import { refreshCategoriesIfDue } from './runtime/refresh-categories.js';
import { QueryScheduler } from './runtime/scheduler.js';
import { RequestMetrics } from './runtime/request-metrics.js';
import { VintedConnectionState } from './runtime/vinted-connection-state.js';
import { CategoryStore } from './store/category.store.js';
import { ListingStore } from './store/listing.store.js';
import { ComparisonStore } from './store/comparison.store.js';
import { OriginStateStore } from './store/origin-state.store.js';
import { QueryStore } from './store/query.store.js';
import { createSupabaseClient } from './store/supabase.js';
import { VintedCollector } from './vinted/collector.js';
import { readVintedPage } from './vinted/response-body.js';
import { preferIpv6 } from './vinted/network.js';
import { sleep } from './vinted/session.js';
import { ForbiddenError, RateLimitedError, parseRetryAfter } from './vinted/errors.js';
import { FEED_SWITCHED_OFF_MESSAGE, FeedOperatorSwitch } from './runtime/feed-operator-switch.js';

preferIpv6();

const config = loadConfig(process.env);
const log = createLogger();
const client = createSupabaseClient(config);
const sessionOptions = { baseUrl: config.vintedBaseUrl, userAgent: config.userAgent };
const budget = new RequestBudget(config.requestsPerMinute);
const requestGuard = new RequestStartGuard(budget);
const health = createHealthState(
  () => budget.usageRatio(),
  undefined,
  Math.max(5 * 60_000, config.tickIntervalMs * 2),
);

// Jede ausgehende Anfrage meldet sich selbst beim Budget - Katalogabfrage,
// Wiederholungen nach 5xx und der getrennte Kategorieabruf gleichermassen.
const metrics = new RequestMetrics();
const comparisonSlots = new ComparisonRequestSlots();
const browser = new ChromeVintedBrowser(config.vintedBaseUrl, {
  profileDir: config.browserProfileDir,
  cdpPort: config.browserCdpPort,
  requestTimeoutMs: config.requestTimeoutMs,
});
const counted = pacedVintedFetch(
  metrics.wrap(async (input, init) => {
    try {
      const response = await browser.fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, controller.signal])
          : controller.signal,
      });
      if (response.status === 403 || response.status === 429) requestGuard.pause();
      return response;
    } finally {
      // Einzelne Abrufe halten auch einen langen Durchlauf mit vielen Filtern lebendig.
      health.recordProgress();
    }
  }),
  {
    minimumIntervalMs: config.requestMinIntervalMs,
    requestTimeoutMs: config.requestTimeoutMs,
    assertCanStart: () => requestGuard.assertCanStart(),
    recordStart: () => {
      budget.record();
      comparisonSlots.recordStart();
    },
  },
);
const vintedConnection = new VintedConnectionState();

const queries = new QueryStore(client);
const originState = new OriginStateStore(client, log);
const categories = new CategoryStore(client);
const listings = new ListingStore(client);
const collector = new VintedCollector(sessionOptions, counted, sleep, vintedConnection);
const browserSession = new BrowserSessionController({
  baseUrl: config.vintedBaseUrl,
  minimumIntervalMs: config.requestMinIntervalMs,
  navigationTiming: counted,
  browser,
  originState,
  queries,
  listings,
  collector,
  budget,
  onVerificationStart: () => requestGuard.beginOperatorVerification(),
  onVerificationEnd: () => requestGuard.endOperatorVerification(),
});
const retention = new ListingRetention(() => listings.purgeExpired(), log);
const comparisonCollection = new ComparisonCollection({
  store: new ComparisonStore(client),
  fetch: counted,
  baseUrl: config.vintedBaseUrl,
  budget,
  originState,
  log,
  connectionState: vintedConnection,
  onOriginPause: () => requestGuard.pause(),
  minimumStepIntervalMs: config.requestMinIntervalMs,
});

const scheduler = new QueryScheduler({
  now: () => new Date(),
  maxRequestsPerCycle: 1,
  onOriginPause: () => requestGuard.pause(),
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

// Betreiber-Not-Aus fuer den Feed; null bedeutet "kein Eintrag" und gilt als an.
const feedSwitch = new FeedOperatorSwitch(async () => {
  const { data, error } = await client
    .from('platform_feature_switches')
    .select('enabled')
    .eq('feature_key', 'vinted_feed')
    .maybeSingle();
  if (error) throw error;
  return data ? data.enabled === true : null;
});

const controller = new AbortController();
const stopWatchdog = startCollectorWatchdog({
  isLive: () => health.isLive(),
  needsBrowserRestart: () => browser.needsRestart,
  closeBrowser: async () => {
    controller.abort();
    await browser.close();
  },
  exit: (code) => process.exit(code),
  log,
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info('shutdown_requested', { signal });
    stopWatchdog();
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
    // Abgeschaltet: keine Vinted-Anfrage; Statusmeldung und Takt laufen weiter.
    const feedEnabled = await feedSwitch.isEnabled();
    const report = (await browserSession.runAutomatic(async () => {
      if (!feedEnabled) return undefined;
      const origin = await originState.getState('vinted');
      if (
        origin.state === 'ready' ||
        (origin.reason !== 'interaction_required' &&
          (!origin.blockedUntil || Date.parse(origin.blockedUntil) <= Date.now()))
      ) {
        requestGuard.allowAutomatic();
      }
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
              const html = await readVintedPage(response);
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
          now: () => new Date(),
          onOriginPause: () => requestGuard.pause(),
        },
        now,
      );

      // Nach vier gezählten regulären Abrufen darf ein Vergleichsschritt laufen.
      // So verhungert der Import auch bei ständig fälligen Filtern nicht. Alles
      // bleibt im selben Browser-Lock, Mindestabstand und gemeinsamen Budget.
      if (comparisonSlots.isDue) {
        const comparisonReport = await comparisonSlots.run(() =>
          comparisonCollection.runOnce(new Date()),
        );
        if (comparisonReport.requested)
          return {
            polled: 0,
            skippedForBudget: 0,
            newListings: 0,
            seeded: 0,
            failed: 0,
            newHits: 0,
          };
      }
      const feedReport = await scheduler.runOnce(now);
      // Ruhende Filter lassen freie Zeit für Vergleiche. Die eigene Taktgrenze
      // begrenzt die Hintergrundarbeit auch ohne fällige Filter.
      if (feedReport.polled === 0 && feedReport.failed === 0 && !feedReport.originPause)
        await comparisonSlots.run(() => comparisonCollection.runOnce(new Date()));
      return feedReport;
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
    if (report.newListings > 0 || report.newHits > 0 || report.seeded > 0) {
      try {
        await listings.notifyFeedUpdates();
      } catch {
        log.error('feed_notification_failed');
      }
    }
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
    if (!feedEnabled) cycleError = FEED_SWITCHED_OFF_MESSAGE;
  } catch (error) {
    // Eine gescheiterte Runde beendet den Dienst nicht. Der naechste Takt
    // versucht es erneut; was dauerhaft kaputt ist, faellt am Health-Endpunkt
    // auf, weil dort die letzte erfolgreiche Runde stehen bleibt.
    cycleError = error instanceof Error ? error.message : String(error);
    log.error('tick_failed', { reason: cycleError });
  }

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
      last_cycle_error: cycleError ?? comparisonCollection.error ?? retention.error,
      vinted_connected_since: connection.connectedSince?.toISOString() ?? null,
      vinted_last_success_at: connection.lastSuccessAt?.toISOString() ?? null,
    });
    if (error) throw error;
  } catch {
    log.error('runtime_status_failed', {
      reason: 'Betriebsmeldung konnte nicht gespeichert werden',
    });
  }

  // Keine fälligen Aufträge und eine bewusste Vinted-Pause sind ebenfalls Fortschritt.
  health.recordProgress();
  const remainingDelay = counted.remainingDelay();
  await sleep(
    remainingDelay > 0 ? Math.min(config.tickIntervalMs, remainingDelay) : config.tickIntervalMs,
  );
}

stopWatchdog();
await browser.close();
browserApi.close();
log.info('stopped');
