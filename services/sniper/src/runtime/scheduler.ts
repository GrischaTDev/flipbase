import type { MarketplaceListing } from '../domain/listing.js';
import type { QueryStatus, SniperQuery } from '../domain/query.js';
import type { Logger } from '../log.js';
import type { OriginState } from '../store/origin-state.store.js';
import type { RequestBudget } from './budget.js';
import { evaluateFailure, type RetryDecision } from './retry-policy.js';

export interface QueryStoreLike {
  dueQueries(now: Date): Promise<SniperQuery[]>;
  recordSuccess?(id: string, now?: Date): Promise<void>;
  recordFailure?(id: string, decision: RetryDecision, now?: Date): Promise<void>;
  markSeeded(id: string): Promise<void>;
  markPolled?(id: string, status: QueryStatus): Promise<void>;
  deactivate?(id: string): Promise<void>;
}

export interface OriginStateStoreLike {
  getState(origin: string): Promise<OriginState>;
  setCooldown(origin: string, blockedUntil: Date, reason: string): Promise<void>;
  setBlocked(origin: string, reason: string): Promise<void>;
  tryAcquireProbe(origin: string): Promise<boolean>;
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

  async setBlocked(origin: string, reason: string): Promise<void> {
    this.state = 'blocked';
    this.blockedUntil = null;
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
}

export interface ListingStoreLike {
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
}

export interface SchedulerDeps {
  queries: QueryStoreLike;
  collector: CollectorLike;
  listings: ListingStoreLike;
  budget: RequestBudget;
  originState?: OriginStateStoreLike;
  log: Logger;
  origin?: string;
}

export class QueryScheduler {
  private readonly origin: string;
  private readonly originStore: OriginStateStoreLike;

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

    // Origin ist im Cooldown (z. B. nach 429 oder 403). Ein aelterer Zustand
    // 'blocked' ohne Ablaufzeit gilt als abgelaufener Cooldown, damit eine
    // bereits gespeicherte Dauersperre sich nach dem Deployment selbst loest.
    if (originState.state === 'cooldown' || originState.state === 'blocked') {
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
      const acquired = await this.originStore.tryAcquireProbe(origin);
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

    // Wenn Probe-Zyklus: Nur genau eine Abfrage ausfuehren!
    const queriesToRun = isProbeCycle ? [dueQueries[0]!] : dueQueries;

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
    let listings: MarketplaceListing[];

    try {
      listings = await this.deps.collector.collect(query);
    } catch (error) {
      const decision = await this.handleFailure(query, error, report, now, isProbe);
      return { haltedOrigin: decision.originUpdate !== undefined };
    }

    // Erfolgreicher Abruf!
    if (isProbe) {
      await this.originStore.releaseProbe(this.origin, true);
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

    return { haltedOrigin: false };
  }

  private async handleFailure(
    query: SniperQuery,
    error: unknown,
    report: CycleReport,
    now: Date,
    isProbe: boolean,
  ): Promise<RetryDecision> {
    report.failed += 1;

    if (isProbe) {
      await this.originStore.releaseProbe(this.origin, false);
    }

    const decision = evaluateFailure(error, query, now);

    this.deps.log.error('query_failed', {
      query: query.id,
      kind: decision.errorKind,
      runState: decision.runState,
      nextAttemptAt: decision.nextAttemptAt?.toISOString() ?? null,
      reason: decision.errorMessage,
    });

    if (this.deps.queries.recordFailure) {
      await this.deps.queries.recordFailure(query.id, decision, now);
    } else if (this.deps.queries.markPolled) {
      const status: QueryStatus =
        decision.errorKind === 'rate_limited'
          ? 'rate_limited'
          : decision.errorKind === 'forbidden'
            ? 'forbidden'
            : 'failed';
      await this.deps.queries.markPolled(query.id, status);
    }

    if (decision.originUpdate) {
      if (decision.originUpdate.state === 'cooldown' && decision.originUpdate.blockedUntil) {
        await this.originStore.setCooldown(
          this.origin,
          decision.originUpdate.blockedUntil,
          decision.originUpdate.reason,
        );
      } else if (decision.originUpdate.state === 'blocked') {
        await this.originStore.setBlocked(this.origin, decision.originUpdate.reason);
      }
    }

    return decision;
  }
}
