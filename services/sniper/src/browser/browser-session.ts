import { randomUUID } from 'node:crypto';
import type { SniperQuery } from '../domain/query.js';
import type { MarketplaceListing } from '../domain/listing.js';
import type { SearchFilterRunResult } from '../store/listing.store.js';
import type { OriginStateStoreLike } from '../runtime/scheduler.js';
import { buildVintedCatalogUrl } from '../vinted/collector.js';
import { VintedCollectorError } from '../vinted/errors.js';
import type { VintedBrowser } from './vinted-browser.js';
import {
  BrowserSessionError,
  type BrowserInput,
  type BrowserSession,
  type BrowserStatus,
} from './browser-types.js';

interface BrowserSessionDependencies {
  baseUrl: string;
  minimumIntervalMs: number;
  now?: () => Date;
  browser: VintedBrowser;
  originState: OriginStateStoreLike;
  queries: { activeQueries(): Promise<SniperQuery[]> };
  collector: {
    collect(query: SniperQuery, options: { allowRetries: boolean }): Promise<MarketplaceListing[]>;
  };
  listings: {
    completeRun(listings: MarketplaceListing[], query: SniperQuery): Promise<SearchFilterRunResult>;
  };
  budget: { hasCapacity(): boolean; record(): void };
}

interface ManualLease {
  id: string;
  owner: string;
  expiresAt: Date;
  queryId: string;
  revision: number;
}
const LEASE_MS = 10 * 60_000;

export class BrowserSessionController implements BrowserSession {
  private readonly now: () => Date;
  private lease: ManualLease | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private tail: Promise<void> = Promise.resolve();
  private message: string | null = null;
  private unavailable = false;
  private localPause = false;

  constructor(private readonly deps: BrowserSessionDependencies) {
    this.now = deps.now ?? (() => new Date());
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async expire(): Promise<void> {
    if (this.lease && this.now() >= this.lease.expiresAt) await this.endLease();
  }

  private async endLease(): Promise<void> {
    this.lease = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    try {
      await this.deps.browser.stopManual();
    } catch {
      this.unavailable = true;
      this.message = 'Die Browsersitzung konnte nicht sicher beendet werden.';
    }
  }

  private requireLease(owner: string, sessionId: string): ManualLease {
    const lease = this.lease;
    if (!lease || lease.owner !== owner || lease.id !== sessionId || this.now() >= lease.expiresAt)
      throw new BrowserSessionError(409, 'Deine Botsitzung ist abgelaufen oder nicht verfügbar.');
    return lease;
  }

  private async snapshot(owner: string): Promise<BrowserStatus> {
    const state = await this.deps.originState.getState('vinted');
    const lease = this.lease;
    return {
      state: this.unavailable
        ? 'unavailable'
        : lease
          ? 'manual'
          : state.reason === 'interaction_required' || this.localPause
            ? 'interaction_required'
            : 'ready',
      sessionId: lease?.owner === owner ? lease.id : null,
      expiresAt: lease?.expiresAt.toISOString() ?? null,
      message: this.message,
    };
  }

  async status(owner: string): Promise<BrowserStatus> {
    return this.exclusive(async () => {
      await this.expire();
      return this.snapshot(owner);
    });
  }

  private async activeQuery(queryId?: string): Promise<SniperQuery> {
    const queries = await this.deps.queries.activeQueries();
    const query = queryId
      ? queries.find((candidate) => candidate.id === queryId)
      : queries.sort(
          (left, right) =>
            (left.lastPolledAt ?? '').localeCompare(right.lastPolledAt ?? '') ||
            left.id.localeCompare(right.id),
        )[0];
    if (!query?.isActive)
      throw new BrowserSessionError(409, 'Du brauchst einen aktiven Suchauftrag für die Prüfung.');
    if (
      query.filterFormatVersion !== 1 ||
      !Number.isSafeInteger(query.filterRevision) ||
      (query.filterRevision ?? 0) < 1
    )
      throw new BrowserSessionError(
        409,
        'Bitte speichere die aktuellen Suchbedingungen vor der Prüfung.',
      );
    return query;
  }

  private async requireNavigationAllowed(query: SniperQuery): Promise<void> {
    const origin = await this.deps.originState.getState('vinted');
    const lastAttempt = query.lastAttemptAt ? Date.parse(query.lastAttemptAt) : 0;
    const notBefore = Math.max(
      origin.blockedUntil ? Date.parse(origin.blockedUntil) : 0,
      query.nextAttemptAt ? Date.parse(query.nextAttemptAt) : 0,
      lastAttempt + Math.max(query.pollIntervalMs, this.deps.minimumIntervalMs),
    );
    if (notBefore > this.now().getTime())
      throw new BrowserSessionError(
        409,
        `Bitte warte bis ${new Date(notBefore).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} Uhr auf den nächsten zulässigen Abruf.`,
      );
    if (!this.deps.budget.hasCapacity())
      throw new BrowserSessionError(409, 'Das Anfragebudget ist aufgebraucht. Bitte warte kurz.');
  }

  async open(owner: string): Promise<BrowserStatus> {
    return this.exclusive(async () => {
      await this.expire();
      if (this.lease) throw new BrowserSessionError(409, 'Die Botsitzung wird bereits bedient.');
      if (this.unavailable)
        throw new BrowserSessionError(
          503,
          this.message ?? 'Die Browsersitzung ist nicht verfügbar.',
        );
      const origin = await this.deps.originState.getState('vinted');
      if (origin.state !== 'blocked' || origin.reason !== 'interaction_required')
        throw new BrowserSessionError(409, 'Der Bot benötigt gerade keine manuelle Prüfung.');
      const query = await this.activeQuery();
      await this.requireNavigationAllowed(query);
      const url = buildVintedCatalogUrl(query, this.deps.baseUrl);
      const deadline = new Date(
        this.now().getTime() + Math.max(query.pollIntervalMs, this.deps.minimumIntervalMs),
      );
      // Auch ein Neustart darf den Abstand zur manuellen Navigation nicht vergessen.
      await this.deps.originState.setBlocked('vinted', 'interaction_required', deadline);
      this.localPause = true;
      this.deps.budget.record();
      try {
        await this.deps.browser.openManual(url);
      } catch {
        this.unavailable = true;
        throw new BrowserSessionError(503, 'Die Browsersitzung konnte nicht geöffnet werden.');
      }
      const lease: ManualLease = {
        id: randomUUID(),
        owner,
        expiresAt: new Date(this.now().getTime() + LEASE_MS),
        queryId: query.id,
        revision: query.filterRevision ?? 0,
      };
      this.lease = lease;
      this.message = null;
      this.timer = setTimeout(() => {
        void this.exclusive(async () => {
          if (this.lease?.id === lease.id) await this.endLease();
        }).catch(() => {
          this.unavailable = true;
        });
      }, LEASE_MS);
      this.timer.unref();
      return this.snapshot(owner);
    });
  }

  async frame(owner: string, sessionId: string): Promise<Uint8Array> {
    return this.exclusive(async () => {
      await this.expire();
      this.requireLease(owner, sessionId);
      const frame = await this.deps.browser.captureFrame();
      this.requireLease(owner, sessionId);
      return frame;
    });
  }

  async input(owner: string, sessionId: string, command: BrowserInput): Promise<void> {
    return this.exclusive(async () => {
      await this.expire();
      this.requireLease(owner, sessionId);
      await this.deps.browser.input(command);
    });
  }

  async verify(owner: string, sessionId: string): Promise<BrowserStatus> {
    return this.exclusive(async () => {
      await this.expire();
      const lease = this.requireLease(owner, sessionId);
      const query = await this.activeQuery(lease.queryId);
      if (query.filterRevision !== lease.revision)
        throw new BrowserSessionError(
          409,
          'Die Suchbedingungen wurden geändert. Bitte öffne die Prüfung erneut.',
        );
      await this.requireNavigationAllowed(query);
      const nextNavigation = new Date(
        this.now().getTime() + Math.max(query.pollIntervalMs, this.deps.minimumIntervalMs),
      );
      try {
        await this.deps.originState.setBlocked('vinted', 'interaction_required', nextNavigation);
        await this.deps.browser.stopManual();
        const collected = await this.deps.collector.collect(query, { allowRetries: false });
        this.requireLease(owner, sessionId);
        const result = await this.deps.listings.completeRun(collected, query);
        if (!result.accepted)
          throw new BrowserSessionError(409, 'Der Suchauftrag wurde während der Prüfung geändert.');
        this.requireLease(owner, sessionId);
        const current = await this.activeQuery(lease.queryId);
        if (current.filterRevision !== lease.revision)
          throw new BrowserSessionError(409, 'Die Suchbedingungen wurden geändert.');
        this.requireLease(owner, sessionId);
        await this.deps.originState.reset('vinted');
        this.requireLease(owner, sessionId);
        this.localPause = false;
        this.message = null;
      } catch (error) {
        this.localPause = true;
        const providerDeadline =
          error instanceof VintedCollectorError
            ? this.now().getTime() + (error.retryAfterSeconds ?? 0) * 1000
            : 0;
        const deadline = new Date(Math.max(nextNavigation.getTime(), providerDeadline));
        await this.deps.originState.setBlocked('vinted', 'interaction_required', deadline);
        this.message =
          error instanceof BrowserSessionError
            ? error.message
            : 'Vinted-Zugriff konnte noch nicht bestätigt werden. Der Bot bleibt pausiert.';
        throw error instanceof BrowserSessionError
          ? error
          : new BrowserSessionError(409, this.message);
      } finally {
        await this.endLease();
      }
      return this.snapshot(owner);
    });
  }

  async close(owner: string, sessionId: string): Promise<void> {
    return this.exclusive(async () => {
      await this.expire();
      this.requireLease(owner, sessionId);
      await this.endLease();
    });
  }

  async runAutomatic<T>(operation: () => Promise<T>): Promise<T | undefined> {
    return this.exclusive(async () => {
      await this.expire();
      const origin = await this.deps.originState.getState('vinted');
      if (
        this.lease ||
        this.localPause ||
        this.unavailable ||
        origin.reason === 'interaction_required'
      )
        return undefined;
      return operation();
    });
  }
}
