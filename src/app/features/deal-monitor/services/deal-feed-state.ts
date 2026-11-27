import { signal } from '@angular/core';
import { FEED_ITEM_LIMIT, FeedItem, FeedPage, FeedRequest } from '../models/deal-monitor.model';

export class DealFeedState {
  readonly items = signal<FeedItem[]>([]);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  readonly covered = signal(false);
  readonly reportedAt = signal<string | null>(null);
  readonly lastCheckedAt = signal<string | null>(null);
  private generation = 0;
  private request: FeedRequest | null = null;
  private busyGeneration: number | null = null;
  private pendingUpdate: { generation: number; delta: boolean } | null = null;

  constructor(private readonly fetchPage: (request: FeedRequest) => Promise<FeedPage>) {}

  setContext(request: FeedRequest | null): void {
    this.generation++;
    this.pendingUpdate = null;
    this.request = request;
    this.items.set([]);
    this.error.set(null);
    this.loaded.set(false);
    this.covered.set(false);
    this.reportedAt.set(null);
    this.lastCheckedAt.set(null);
    if (request) void this.refresh();
  }

  /** Aktualisiert Live-Filter im selben Feed ohne hartes Leeren bis die Serverantwort eintrifft. */
  updateRequest(request: FeedRequest): void {
    this.generation++;
    this.pendingUpdate = null;
    this.request = request;
    void this.refresh(false);
  }

  notifyUpdate(delta: boolean): void {
    if (!this.request) return;
    if (this.busyGeneration === this.generation) {
      this.pendingUpdate = {
        generation: this.generation,
        delta: delta && (this.pendingUpdate?.delta ?? true),
      };
      return;
    }
    void this.refresh(delta);
  }

  async refresh(delta = false): Promise<void> {
    const generation = this.generation;
    const request = this.request;
    if (!request || this.busyGeneration === generation) return;
    this.busyGeneration = generation;
    const afterTime = delta ? this.items()[0]?.first_seen_at : undefined;
    try {
      let useDelta = !!afterTime;
      let page = await this.fetchPage(afterTime ? { ...request, afterTime } : request);
      if (generation !== this.generation) return;
      if (useDelta && page.items.length >= FEED_ITEM_LIMIT) {
        useDelta = false;
        page = await this.fetchPage(request);
      }
      if (generation !== this.generation) return;
      this.covered.set(page.covered);
      this.reportedAt.set(page.reported_at);
      this.lastCheckedAt.set(page.last_checked_at ?? null);
      if (useDelta) {
        this.applyDelta(page.items);
      } else {
        this.items.set(page.items);
      }
      this.loaded.set(true);
      this.error.set(null);
    } catch (error) {
      if (generation === this.generation)
        this.error.set(error instanceof Error ? error.message : 'Laden fehlgeschlagen.');
    } finally {
      if (this.busyGeneration === generation) this.busyGeneration = null;
      if (this.pendingUpdate?.generation === generation) {
        const { delta } = this.pendingUpdate;
        this.pendingUpdate = null;
        // Der regelmäßige Abgleich übernimmt Wiederholungen nach Fehlern.
        if (generation === this.generation && !this.error()) void this.refresh(delta);
      }
    }
  }

  destroy(): void {
    this.generation++;
    this.pendingUpdate = null;
    this.request = null;
  }

  private applyDelta(updates: FeedItem[]): void {
    if (updates.length === 0) return;
    const current = this.items();
    const previous = new Map(current.map((item) => [item.id, item]));
    const updated = new Set(updates.map((item) => item.id));
    const next = [
      ...updates.map((item) => {
        const old = previous.get(item.id);
        return old && JSON.stringify(old) === JSON.stringify(item) ? old : item;
      }),
      ...current.filter((item) => !updated.has(item.id)),
    ].slice(0, FEED_ITEM_LIMIT);
    if (next.length !== current.length || next.some((item, index) => current[index] !== item))
      this.items.set(next);
  }
}
