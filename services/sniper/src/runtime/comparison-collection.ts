import { createTitleKeywordMatcher } from '../domain/title-keywords.js';
import { searchFilterRequest } from '../domain/search-filter-request.js';
import type { Logger } from '../log.js';
import type {
  ComparisonStoreLike,
  ComparisonTask,
  ComparisonTaskResult,
  DetailComparisonTask,
} from '../store/comparison.store.js';
import {
  buildVintedComparisonCatalogUrl,
  parseVintedComparisonCatalogPage,
} from '../vinted/comparison-catalog-page.js';
import { parseVintedComparisonItemPage } from '../vinted/comparison-item-page.js';
import {
  ForbiddenError,
  parseRetryAfter,
  RateLimitedError,
  UnauthorizedError,
  VintedHttpError,
  VintedParserError,
  VintedServerError,
} from '../vinted/errors.js';
import { readVintedPage } from '../vinted/response-body.js';
import type { FetchLike } from '../vinted/session.js';
import { RequestBudgetUnavailableError, type RequestBudget } from './budget.js';
import { RequestPausedError } from './request-start-guard.js';
import { evaluateFailure } from './retry-policy.js';
import type { OriginStateStoreLike } from './scheduler.js';
import type { VintedConnectionState } from './vinted-connection-state.js';

export interface ComparisonCollectionDeps {
  store: ComparisonStoreLike;
  fetch: FetchLike;
  baseUrl: string;
  budget: Pick<RequestBudget, 'hasCapacity'>;
  originState: OriginStateStoreLike;
  log: Logger;
  connectionState?: VintedConnectionState;
  onOriginPause?: () => void;
  now?: () => Date;
  minimumStepIntervalMs?: number;
}

export interface ComparisonCollectionReport {
  requested: boolean;
  processed: number;
  failed: number;
  stale: number;
}

/** Höchstens jeder fünfte tatsächliche Abruf gehört dem Vergleichsbestand. */
export class ComparisonRequestSlots {
  private regularStarts = 0;
  private comparisonActive = false;

  get isDue(): boolean {
    return this.regularStarts >= 4;
  }

  recordStart(): void {
    this.regularStarts = this.comparisonActive ? 0 : Math.min(4, this.regularStarts + 1);
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    this.comparisonActive = true;
    try {
      return await operation();
    } finally {
      this.comparisonActive = false;
    }
  }
}

/** Ein einzelner Vergleichsabruf im gemeinsamen Browser- und Anfragebudget. */
export class ComparisonCollection {
  private running = false;
  private nextStepAt = 0;
  error: string | null = null;

  constructor(private readonly deps: ComparisonCollectionDeps) {}

  async runOnce(now: Date): Promise<ComparisonCollectionReport> {
    const report: ComparisonCollectionReport = {
      requested: false,
      processed: 0,
      failed: 0,
      stale: 0,
    };
    if (this.running || now.getTime() < this.nextStepAt || !this.deps.budget.hasCapacity())
      return report;
    this.running = true;
    let task: ComparisonTask | null = null;
    try {
      this.nextStepAt = now.getTime() + (this.deps.minimumStepIntervalMs ?? 15_000);
      // Ausschließlich der Feed-Scheduler darf eine abgelaufene Origin-Sperre prüfen.
      // Der Hintergrundimport darf weder manuelle Pausen noch Probeleases umgehen.
      const origin = await this.deps.originState.getState('vinted');
      if (origin.state !== 'ready' || origin.probeInFlight) return report;
      task = await this.deps.store.claim(now);
      if (!task) return report;
      const result = await this.collect(task, report);
      const accepted = await this.deps.store.complete(task, result);
      if (accepted) report.processed = 1;
      else report.stale = 1;
      this.error = null;
    } catch (error) {
      if (error instanceof RequestBudgetUnavailableError || error instanceof RequestPausedError) {
        report.requested = false;
        if (task) {
          try {
            await this.recordFailure(task, error, this.now());
          } catch (saveError) {
            report.failed = 1;
            this.error = 'Vergleichsauftrag konnte nicht zurückgestellt werden.';
            this.deps.log.error('comparison_retry_failed', {
              reason: saveError instanceof Error ? saveError.message : String(saveError),
            });
          }
        }
        return report;
      }
      report.failed = 1;
      this.error = 'Vergleichsdaten konnten nicht aktualisiert werden.';
      const failedAt = this.now();
      if (task) {
        try {
          await this.recordFailure(task, error, failedAt);
        } catch (saveError) {
          this.deps.log.error('comparison_retry_failed', {
            reason: saveError instanceof Error ? saveError.message : String(saveError),
          });
        }
      }
      this.deps.log.error('comparison_collection_failed', {
        task: task?.kind ?? 'claim',
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
    return report;
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private async collect(
    task: ComparisonTask,
    report: ComparisonCollectionReport,
  ): Promise<ComparisonTaskResult> {
    const url =
      task.kind === 'catalog'
        ? buildVintedComparisonCatalogUrl(task.query, this.deps.baseUrl, task.page)
        : comparisonItemUrl(task, this.deps.baseUrl);
    try {
      // Kein eigener Retry: genau eine Anfrage je fortsetzbarem Arbeitsschritt.
      // Die injizierte Funktion ist derselbe gezählte Abruf wie beim Feed.
      report.requested = true;
      const response = await this.deps.fetch(url, { redirect: 'error' });
      const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
      if (response.status === 403 || response.headers.get('cf-mitigated') === 'challenge') {
        await response.body?.cancel();
        throw new ForbiddenError('Vinted refused the comparison request', {
          status: response.status,
          challengeDetected: response.headers.get('cf-mitigated') === 'challenge',
          retryAfterSeconds,
        });
      }
      if (response.status === 429) {
        await response.body?.cancel();
        throw new RateLimitedError('Vinted comparison rate limit reached', {
          retryAfterSeconds,
        });
      }
      if (response.status === 401) {
        await response.body?.cancel();
        throw new UnauthorizedError('Vinted comparison session rejected');
      }
      if (task.kind === 'detail' && [404, 410].includes(response.status)) {
        await response.body?.cancel();
        this.deps.connectionState?.recordSuccess();
        return unavailableItem(task, this.now());
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status >= 500) throw new VintedServerError(response.status);
        throw new VintedHttpError(response.status);
      }
      const html = await readVintedPage(response);
      if (html.includes('challenge-running') || html.includes('<title>Just a moment...</title>'))
        throw new ForbiddenError('Vinted comparison challenge detected', {
          status: response.status,
          phase: 'body',
          challengeDetected: true,
          retryAfterSeconds,
        });
      const observedAt = this.now();
      let result: ComparisonTaskResult;
      try {
        if (task.kind === 'catalog') {
          const source = parseVintedComparisonCatalogPage(html, this.deps.baseUrl);
          if (source.pagination && source.pagination.currentPage !== task.page)
            throw new VintedParserError('Vinted returned a different comparison catalog page');
          const matches = createTitleKeywordMatcher(
            task.query.titleKeywords ?? [],
            task.query.keywordMode ?? 'all',
            task.query.excludedTitleKeywords ?? [],
          );
          const request = searchFilterRequest(task.query);
          result = {
            kind: 'catalog',
            observed_at: observedAt.toISOString(),
            page: task.page,
            sourceItemCount: source.sourceItemCount,
            requestIndex: request.index,
            requestCount: request.count,
            items: source.items.filter((item) => matches(item.title)),
            pagination: source.pagination,
          };
        } else {
          result = {
            kind: 'detail',
            observed_at: observedAt.toISOString(),
            item: parseVintedComparisonItemPage(html, task.externalId, observedAt),
          };
        }
      } catch (error) {
        if (error instanceof VintedParserError) throw error;
        throw new VintedParserError(
          error instanceof Error ? error.message : 'Invalid comparison page',
          { phase: 'parse', status: response.status },
        );
      }
      this.deps.connectionState?.recordSuccess();
      return result;
    } catch (error) {
      if (
        !(error instanceof RequestBudgetUnavailableError) &&
        !(error instanceof RequestPausedError)
      )
        this.deps.connectionState?.recordFailure();
      throw error;
    }
  }

  private async recordFailure(task: ComparisonTask, error: unknown, now: Date): Promise<void> {
    if (error instanceof RequestBudgetUnavailableError || error instanceof RequestPausedError) {
      await this.deps.store.fail(
        task,
        new Date(now.getTime() + 15_000),
        'request_deferred',
        'Gemeinsamer Vinted-Abruf wurde zurückgestellt.',
      );
      return;
    }
    const decision = evaluateFailure(error, task, now);
    const origin = decision.originUpdate;
    if (origin) {
      this.deps.onOriginPause?.();
      if (origin.state === 'blocked')
        await this.deps.originState.setBlocked(
          'vinted',
          origin.reason,
          origin.blockedUntil ?? undefined,
        );
      else if (origin.blockedUntil)
        await this.deps.originState.setCooldown('vinted', origin.blockedUntil, origin.reason);
    }
    await this.deps.store.fail(
      task,
      decision.nextAttemptAt ?? new Date(now.getTime() + 5 * 60_000),
      decision.errorKind,
      decision.errorMessage,
    );
  }
}

function comparisonItemUrl(task: DetailComparisonTask, baseUrl: string): URL {
  const url = new URL(task.url);
  const base = new URL(baseUrl);
  if (
    url.protocol !== 'https:' ||
    url.origin !== base.origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !new RegExp(`^/items/${task.externalId}(?:-[^/]+)?/?$`).test(url.pathname)
  )
    throw new Error('Invalid comparison item URL');
  return url;
}

function unavailableItem(task: DetailComparisonTask, observedAt: Date): ComparisonTaskResult {
  return {
    kind: 'detail',
    observed_at: observedAt.toISOString(),
    item: {
      externalId: task.externalId,
      title: null,
      price: null,
      currency: null,
      brand: null,
      categoryId: null,
      categoryPath: [],
      size: null,
      condition: null,
      color: null,
      material: null,
      model: null,
      status: 'unavailable',
      publication: { earliest: null, latest: null, label: null },
    },
  };
}
