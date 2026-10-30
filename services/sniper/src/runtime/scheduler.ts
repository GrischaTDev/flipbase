import type { MarketplaceListing } from '../domain/listing.js';
import type { QueryStatus, SniperQuery } from '../domain/query.js';
import type { Logger } from '../log.js';
import type { OriginState } from '../store/origin-state.store.js';
import type { SearchFilterRunResult, SearchFilterRunDiagnostics } from '../store/listing.store.js';
import { RequestBudgetUnavailableError, type RequestBudget } from './budget.js';
import { createTitleKeywordMatcher } from '../domain/title-keywords.js';
import { searchFilterRequest } from '../domain/search-filter-request.js';
import { planSearchRequests, type SearchRequestPlan } from './search-request-planner.js';
import { RequestPausedError } from './request-start-guard.js';
import { evaluateFailure, type RetryDecision } from './retry-policy.js';
import { VintedCollectorError } from '../vinted/errors.js';

export interface QueryStoreLike {
  dueQueries(now: Date): Promise<SniperQuery[]>;
  recordSuccess?(id: string, now?: Date): Promise<void>;
  recordFailure?(
    id: string,
    decision: RetryDecision,
    now?: Date,
    revision?: number,
    cursor?: number,
  ): Promise<void>;
  markSeeded(id: string): Promise<void>;
  markPolled?(id: string, status: QueryStatus): Promise<void>;
  deactivate?(id: string): Promise<void>;
}

export interface OriginStateStoreLike {
  getState(origin: string): Promise<OriginState>;
  setCooldown(origin: string, blockedUntil: Date, reason: string): Promise<void>;
  setBlocked(origin: string, reason: string, notBefore?: Date): Promise<void>;
  tryAcquireProbe(origin: string, now: Date): Promise<boolean>;
  releaseProbe(origin: string, success: boolean): Promise<void>;
  reset(origin: string): Promise<void>;
}

class InMemoryOriginStateStore implements OriginStateStoreLike {
  private state: 'ready' | 'cooldown' | 'blocked' = 'ready';
  private blockedUntil: string | null = null;
  private reason: string | null = null;
  private probeInFlight = false;

  async getState(origin: string): Promise<OriginState> {
    return {
      origin,
      state: this.state,
      blockedUntil: this.blockedUntil,
      reason: this.reason,
      probeInFlight: this.probeInFlight,
      updatedAt: new Date().toISOString(),
    };
  }

  async setCooldown(origin: string, blockedUntil: Date, reason: string): Promise<void> {
    this.state = 'cooldown';
    this.blockedUntil = blockedUntil.toISOString();
    this.reason = reason;
    this.probeInFlight = false;
  }

  async setBlocked(origin: string, reason: string, notBefore?: Date): Promise<void> {
    this.state = 'blocked';
    this.blockedUntil = notBefore?.toISOString() ?? null;
    this.reason = reason;
    this.probeInFlight = false;
  }

  async tryAcquireProbe(_origin: string): Promise<boolean> {
    if (this.probeInFlight) return false;
    this.probeInFlight = true;
    return true;
  }

  async releaseProbe(_origin: string, success: boolean): Promise<void> {
    this.probeInFlight = false;
    if (success) {
      this.state = 'ready';
      this.blockedUntil = null;
      this.reason = null;
    }
  }

  async reset(_origin: string): Promise<void> {
    this.state = 'ready';
    this.blockedUntil = null;
    this.reason = null;
    this.probeInFlight = false;
  }
}

export interface CollectorLike {
  collect(query: SniperQuery): Promise<MarketplaceListing[]>;
  collectSource?(query: SniperQuery, options?: { page?: number }): Promise<MarketplaceListing[]>;
}

export interface ListingStoreLike {
  completeRun?(
    listings: MarketplaceListing[],
    query: SniperQuery,
    diagnostics?: SearchFilterRunDiagnostics,
  ): Promise<SearchFilterRunResult>;
  saveNew(
    listings: MarketplaceListing[],
    discoveredByQueryId: string,
  ): Promise<MarketplaceListing[]>;
  evaluateHits?(queryId: string, reportHits: boolean): Promise<number>;
}

export interface CycleReport {
  polled: number;
  skippedForBudget: number;
  newListings: number;
  seeded: number;
  failed: number;
  newHits: number;
  originPause?: { reason: string; until: string | null };
}

export interface SchedulerDeps {
  queries: QueryStoreLike;
  collector: CollectorLike;
  listings: ListingStoreLike;
  budget: RequestBudget;
  originState?: OriginStateStoreLike;
  log: Logger;
  origin?: string;
  now?: () => Date;
  maxRequestsPerCycle?: number;
  onOriginPause?: () => void;
}

interface ConsumerSourceWindow {
  checkpointKey: string;
  previousIds: ReadonlySet<string> | undefined;
  received: Map<string, MarketplaceListing>;
  coverage: SearchFilterRunDiagnostics['coverage'];
  pages: number;
  needsMore: boolean;
}

const MAX_CONSUMER_SOURCE_WINDOWS = 2048;

export class QueryScheduler {
  private readonly origin: string;
  private readonly originStore: OriginStateStoreLike;
  private readonly previousConsumerSourceIds = new Map<string, Set<string>>();

  constructor(private readonly deps: SchedulerDeps) {
    this.origin = deps.origin ?? 'vinted';
    this.originStore = deps.originState ?? new InMemoryOriginStateStore();
  }

  async runOnce(now: Date): Promise<CycleReport> {
    const report: CycleReport = {
      polled: 0,
      skippedForBudget: 0,
      newListings: 0,
      seeded: 0,
      failed: 0,
      newHits: 0,
    };

    const origin = this.origin;
    const originState = await this.originStore.getState(origin);

    let isProbeCycle = false;

    if (originState.state === 'blocked' && originState.reason === 'interaction_required') {
      report.originPause = { reason: 'interaction_required', until: null };
      return report;
    }

    // Origin ist im Cooldown (z. B. nach 429 oder 403). Ein aelterer Zustand
    // 'blocked' ohne Ablaufzeit gilt als abgelaufener Cooldown, damit eine
    // bereits gespeicherte Dauersperre sich nach dem Deployment selbst loest.
    if (originState.state === 'cooldown' || originState.state === 'blocked') {
      report.originPause = {
        reason: originState.reason ?? 'unknown',
        until: originState.blockedUntil,
      };
      const blockedUntilMs = originState.blockedUntil
        ? new Date(originState.blockedUntil).getTime()
        : null;

      if (blockedUntilMs !== null && blockedUntilMs > now.getTime()) {
        this.deps.log.info('origin_in_cooldown', {
          origin,
          blockedUntil: originState.blockedUntil,
          reason: originState.reason,
        });
        return report;
      }

      // Cooldown ist abgelaufen: Genau ein Probe-Request zulaessig!
      const acquired = await this.originStore.tryAcquireProbe(origin, now);
      if (!acquired) {
        this.deps.log.info('origin_probe_already_in_flight', { origin });
        return report;
      }
      isProbeCycle = true;
    }

    let dueQueries: SniperQuery[];
    try {
      dueQueries = await this.deps.queries.dueQueries(now);
    } catch (error) {
      if (isProbeCycle) {
        await this.originStore.releaseProbe(origin, false);
      }
      report.failed += 1;
      this.deps.log.error('due_queries_failed', {
        reason: error instanceof Error ? error.message : String(error),
      });
      return report;
    }

    if (dueQueries.length === 0) {
      if (isProbeCycle) {
        await this.originStore.releaseProbe(origin, false);
      }
      return report;
    }

    // Dieselbe fehlgeschlagene Abfrage pruefen: Der gespeicherte Fehlerzaehler
    // verlaengert dann die gemeinsame Pause auch nach einem Dienstneustart.
    // Sonst beginnen drei Marken nacheinander jeweils wieder bei fuenf Minuten.
    const previousFailure = dueQueries
      .filter(
        (query) => query.runState === 'cooldown' && query.lastErrorKind === originState.reason,
      )
      .sort((a, b) => (b.lastAttemptAt ?? '').localeCompare(a.lastAttemptAt ?? ''))[0];
    const queriesToRun = isProbeCycle ? [previousFailure ?? dueQueries[0]!] : dueQueries;

    if (this.deps.collector.collectSource) {
      const plans = planSearchRequests(queriesToRun);
      if (isProbeCycle && plans.length === 0) await this.originStore.releaseProbe(origin, false);
      const limit = this.deps.maxRequestsPerCycle ?? 1;
      for (const plan of plans.slice(0, limit)) {
        if (!this.deps.budget.hasCapacity()) {
          report.skippedForBudget += plan.consumers.length;
          if (isProbeCycle) await this.originStore.releaseProbe(origin, false);
          break;
        }
        await this.pollShared(plan, report, isProbeCycle);
        if (report.originPause) break;
      }
      return report;
    }

    for (const query of queriesToRun) {
      if (!this.deps.budget.hasCapacity()) {
        report.skippedForBudget += 1;
        if (isProbeCycle) {
          await this.originStore.releaseProbe(origin, false);
        }
        continue;
      }

      const failedBefore = report.failed;
      let cycleHalted = false;

      try {
        const result = await this.pollOne(query, report, now, isProbeCycle);
        if (result.haltedOrigin) {
          cycleHalted = true;
        }
      } catch (error) {
        cycleHalted = report.originPause !== undefined;
        if (report.failed === failedBefore) {
          report.failed += 1;
        }
        if (isProbeCycle) {
          await this.originStore.releaseProbe(origin, false);
        }
        this.deps.log.error('cycle_failed_unhandled', {
          query: query.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }

      if (cycleHalted) {
        break; // Keine weiteren Abfragen in diesem Zyklus nach Origin-Cooldown / Block
      }
    }

    this.deps.log.info('cycle', {
      polled: report.polled,
      new: report.newListings,
      seeded: report.seeded,
      failed: report.failed,
      skipped: report.skippedForBudget,
      newHits: report.newHits,
      budget: this.deps.budget.usageRatio().toFixed(2),
    });

    return report;
  }

  private async pollOne(
    query: SniperQuery,
    report: CycleReport,
    now: Date,
    isProbe: boolean,
  ): Promise<{ haltedOrigin: boolean }> {
    if (query.filterFormatVersion === 1 && !this.deps.listings.completeRun) {
      throw new Error('Updated search filter ingestion is unavailable');
    }
    let listings: MarketplaceListing[];

    try {
      listings = await this.deps.collector.collect(query);
    } catch (error) {
      if (error instanceof RequestBudgetUnavailableError || error instanceof RequestPausedError) {
        report.skippedForBudget += 1;
        if (isProbe) await this.originStore.releaseProbe(this.origin, false);
        return { haltedOrigin: false };
      }
      const decision = await this.handleFailure(query, error, report, this.currentTime(), isProbe);
      return { haltedOrigin: decision.originUpdate !== undefined };
    }

    if (query.filterFormatVersion === 1) {
      const completeRun = this.deps.listings.completeRun;
      if (!completeRun) throw new Error('Updated search filter ingestion is unavailable');
      const completed = await completeRun.call(this.deps.listings, listings, query);
      report.polled += 1;
      if (completed.accepted) {
        report.newHits += completed.hits;
        if (completed.seeded) report.seeded += 1;
        else report.newListings += completed.created;
      } else {
        this.deps.log.info('outdated_search_filter_response_discarded', { queryId: query.id });
      }
      if (isProbe) {
        await this.originStore.releaseProbe(this.origin, completed.accepted);
        if (completed.accepted) delete report.originPause;
      }
      return { haltedOrigin: false };
    }
    const created = await this.deps.listings.saveNew(listings, query.id);
    report.polled += 1;

    let evaluated = false;
    if (this.deps.listings.evaluateHits) {
      try {
        report.newHits += await this.deps.listings.evaluateHits(query.id, query.isSeeded);
        evaluated = true;
      } catch (error) {
        this.deps.log.error('evaluate_hits_failed', {
          queryId: query.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      evaluated = true;
    }

    if (query.isSeeded) {
      report.newListings += created.length;
    } else if (evaluated) {
      await this.deps.queries.markSeeded(query.id);
      report.seeded += 1;
    }

    if (this.deps.queries.recordSuccess) {
      await this.deps.queries.recordSuccess(query.id, now);
    } else if (this.deps.queries.markPolled) {
      await this.deps.queries.markPolled(query.id, 'ok');
    }

    if (isProbe) {
      await this.originStore.releaseProbe(this.origin, true);
      delete report.originPause;
    }

    return { haltedOrigin: false };
  }

  private async handleFailure(
    query: SniperQuery,
    error: unknown,
    report: CycleReport,
    now: Date,
    isProbe: boolean,
    updateOrigin = true,
  ): Promise<RetryDecision> {
    report.failed += 1;

    const decision = evaluateFailure(error, query, now);

    this.deps.log.error('query_failed', {
      query: query.id,
      kind: decision.errorKind,
      runState: decision.runState,
      nextAttemptAt: decision.nextAttemptAt?.toISOString() ?? null,
      reason: decision.errorMessage,
      ...(error instanceof VintedCollectorError
        ? {
            httpStatus: error.status ?? null,
            phase: error.phase,
            challengeDetected: error.challengeDetected ?? false,
            retryAfterSeconds: error.retryAfterSeconds ?? null,
          }
        : {}),
    });

    if (decision.originUpdate && updateOrigin) {
      this.deps.onOriginPause?.();
      report.originPause = {
        reason: decision.originUpdate.reason,
        until: decision.originUpdate.blockedUntil?.toISOString() ?? null,
      };
      if (decision.originUpdate.state === 'cooldown' && decision.originUpdate.blockedUntil) {
        await this.originStore.setCooldown(
          this.origin,
          decision.originUpdate.blockedUntil,
          decision.originUpdate.reason,
        );
      } else if (decision.originUpdate.state === 'blocked') {
        await this.originStore.setBlocked(
          this.origin,
          decision.originUpdate.reason,
          decision.originUpdate.blockedUntil ?? undefined,
        );
      }
    }

    if (isProbe) await this.originStore.releaseProbe(this.origin, false);

    if (this.deps.queries.recordFailure) {
      if (query.filterFormatVersion === 1)
        await this.deps.queries.recordFailure(
          query.id,
          decision,
          now,
          query.filterRevision,
          query.requestCursor ?? 0,
        );
      else await this.deps.queries.recordFailure(query.id, decision, now);
    } else if (this.deps.queries.markPolled) {
      const status: QueryStatus =
        decision.errorKind === 'rate_limited'
          ? 'rate_limited'
          : decision.errorKind === 'forbidden'
            ? 'forbidden'
            : 'failed';
      await this.deps.queries.markPolled(query.id, status);
    }

    return decision;
  }

  private currentTime(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private async pollShared(
    plan: SearchRequestPlan,
    report: CycleReport,
    isProbe: boolean,
  ): Promise<void> {
    if (plan.sourceQuery.filterFormatVersion !== 1) {
      const failedBefore = report.failed;
      try {
        await this.pollOne(plan.sourceQuery, report, this.currentTime(), isProbe);
      } catch (error) {
        if (report.failed === failedBefore) {
          try {
            await this.handleFailure(plan.sourceQuery, error, report, this.currentTime(), isProbe);
          } catch {
            this.deps.log.error('legacy_search_failure_record_failed', {
              queryId: plan.sourceQuery.id,
            });
          }
        } else if (isProbe) await this.originStore.releaseProbe(this.origin, false);
      }
      return;
    }
    const collectSource = this.deps.collector.collectSource;
    const completeRun = this.deps.listings.completeRun;
    if (!collectSource || !completeRun) {
      report.failed += plan.consumers.length;
      if (isProbe) await this.originStore.releaseProbe(this.origin, false);
      this.deps.log.error('shared_search_storage_unavailable');
      return;
    }
    const started = this.currentTime().getTime();
    const windows = new Map<SniperQuery, ConsumerSourceWindow>();
    for (const query of plan.consumers) {
      const checkpointKey = JSON.stringify([query.id, query.filterRevision, plan.key]);
      const previousIds = this.previousConsumerSourceIds.get(checkpointKey);
      const seededLane =
        !plan.validationError &&
        (query.seededRequests ?? []).includes(searchFilterRequest(query).index);
      windows.set(query, {
        checkpointKey,
        previousIds,
        received: new Map(),
        coverage: previousIds || seededLane ? 'unknown' : 'initial',
        pages: 0,
        needsMore: true,
      });
    }
    let page = 0;
    try {
      if (plan.validationError) throw plan.validationError;
      let more = true;
      while (more) {
        page++;
        const listings = await collectSource.call(this.deps.collector, plan.sourceQuery, { page });
        for (const window of windows.values()) {
          if (!window.needsMore) continue;
          window.pages = page;
          for (const listing of listings) window.received.set(listing.externalId, listing);
          const overlap =
            window.previousIds !== undefined &&
            listings.some((listing) => window.previousIds!.has(listing.externalId));
          if (overlap) window.coverage = 'caught_up';
          window.needsMore = window.previousIds !== undefined && !overlap && listings.length === 96;
        }
        const needsCatchup = [...windows.values()].some((window) => window.needsMore);
        more = needsCatchup && page < 3 && this.deps.budget.hasCapacity() && !isProbe;
        if (needsCatchup && !more) {
          for (const window of windows.values()) if (window.needsMore) window.coverage = 'limited';
        }
      }
    } catch (error) {
      if (error instanceof RequestBudgetUnavailableError || error instanceof RequestPausedError) {
        report.skippedForBudget += plan.consumers.length;
        if (isProbe) await this.originStore.releaseProbe(this.origin, false);
        return;
      }
      const rejectedAt = this.currentTime();
      // Gemeinsame Pause nur einmal setzen, mit der längsten erforderlichen Frist.
      const severity = (query: SniperQuery) => {
        const decision = evaluateFailure(error, query, rejectedAt);
        if (decision.originUpdate?.reason === 'interaction_required') return Infinity;
        return decision.originUpdate?.blockedUntil?.getTime() ?? 0;
      };
      const leader = [...plan.consumers].sort((a, b) => severity(b) - severity(a))[0]!;
      for (const query of [leader, ...plan.consumers.filter((q) => q !== leader)]) {
        try {
          await this.handleFailure(query, error, report, rejectedAt, isProbe, query === leader);
        } catch {
          this.deps.log.error('shared_search_failure_record_failed', { queryId: query.id });
        }
      }
      return;
    }

    let accepted = false;
    // Bereits laufende Teilabfragen erhalten neue Funde vor dem stillen
    // Ersteinlesen weiterer Filter derselben Rohantwort.
    const isSeed = (query: SniperQuery) =>
      !(query.seededRequests ?? []).includes(searchFilterRequest(query).index);
    const consumers = [...plan.consumers].sort((a, b) => Number(isSeed(a)) - Number(isSeed(b)));
    for (const query of consumers) {
      try {
        const window = windows.get(query)!;
        const diagnostics: SearchFilterRunDiagnostics = {
          coverage: window.coverage,
          source_pages: window.pages,
          shared_filter_count: plan.consumers.length,
          duration_ms: Math.min(86_400_000, Math.max(0, this.currentTime().getTime() - started)),
        };
        const matches = createTitleKeywordMatcher(
          query.titleKeywords ?? [],
          query.keywordMode ?? 'all',
          query.excludedTitleKeywords ?? [],
        );
        const completed = await completeRun.call(
          this.deps.listings,
          [...window.received.values()].filter((listing) => matches(listing.title)),
          query,
          diagnostics,
        );
        report.polled += 1;
        if (completed.accepted) {
          accepted = true;
          report.newHits += completed.hits;
          if (completed.seeded) report.seeded += 1;
          else report.newListings += completed.created;
          // Jede Revision und Teilabfrage behält ihren eigenen bestätigten Stand.
          // Ein schneller anderer Filter kann diesen Ausschnitt nicht vorziehen.
          this.previousConsumerSourceIds.delete(window.checkpointKey);
          this.previousConsumerSourceIds.set(window.checkpointKey, new Set(window.received.keys()));
          if (this.previousConsumerSourceIds.size > MAX_CONSUMER_SOURCE_WINDOWS)
            this.previousConsumerSourceIds.delete(
              this.previousConsumerSourceIds.keys().next().value!,
            );
        } else {
          this.deps.log.info('outdated_search_filter_response_discarded', { queryId: query.id });
        }
      } catch (error) {
        this.deps.log.error('search_filter_completion_failed', {
          queryId: query.id,
          reason: error instanceof Error ? error.message : String(error),
        });
        try {
          await this.handleFailure(query, error, report, this.currentTime(), false, false);
        } catch {
          this.deps.log.error('search_filter_failure_record_failed', { queryId: query.id });
        }
      }
    }
    if (isProbe) {
      await this.originStore.releaseProbe(this.origin, accepted);
      if (accepted) delete report.originPause;
    }
    this.deps.log.info('cycle', {
      polled: report.polled,
      new: report.newListings,
      seeded: report.seeded,
      failed: report.failed,
      skipped: report.skippedForBudget,
      newHits: report.newHits,
      sharedFilters: plan.consumers.length,
      sourcePages: page,
      coverage: [...new Set([...windows.values()].map((window) => window.coverage))].join(','),
    });
  }
}
