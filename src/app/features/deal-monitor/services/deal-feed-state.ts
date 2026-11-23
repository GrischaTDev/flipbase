import { signal } from '@angular/core';
import { FEED_ITEM_LIMIT, FeedItem, FeedPage, FeedRequest } from '../models/deal-monitor.model';

/** Abstand, in dem der langsame Modus den nächsten neuen Fund einschiebt. */
export const SLOW_MODE_STEP_MS = 900;

export class DealFeedState {
  readonly items = signal<FeedItem[]>([]);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  readonly covered = signal(false);
  readonly reportedAt = signal<string | null>(null);
  readonly slowMode = signal(false);
  readonly queued = signal<FeedItem[]>([]);
  private generation = 0;
  private request: FeedRequest | null = null;
  private busyGeneration: number | null = null;
  private pendingUpdate: { generation: number; delta: boolean } | null = null;
  private releaseTimer?: ReturnType<typeof setTimeout>;

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
    this.clearQueue();
    if (request) void this.refresh();
  }

  setSlowMode(enabled: boolean): void {
    this.slowMode.set(enabled);
    if (enabled) return;
    const waiting = this.queued();
    this.clearQueue();
    if (waiting.length) this.items.update((items) => [...waiting, ...items]);
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
    const afterTime = delta && !this.slowMode() ? this.items()[0]?.first_seen_at : undefined;
    try {
      let useDelta = !!afterTime;
      let page = await this.fetchPage(afterTime ? { ...request, afterTime } : request);
      if (generation !== this.generation) return;
      if (useDelta && (page.items.length >= FEED_ITEM_LIMIT || this.slowMode())) {
        useDelta = false;
        page = await this.fetchPage(request);
      }
      if (generation !== this.generation) return;
      this.covered.set(page.covered);
      this.reportedAt.set(page.reported_at);
      if (useDelta) {
        this.applyDelta(page.items);
      } else if (this.slowMode() && this.loaded() && this.items().length) {
        this.queueNewFinds(page.items);
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
    this.clearQueue();
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

  private queueNewFinds(pageItems: FeedItem[]): void {
    const newest = this.items()[0];
    const shown = new Set(this.items().map((item) => item.id));
    const present = new Set(pageItems.map((item) => item.id));
    const waiting = new Set(this.queued().map((item) => item.id));
    const fresh = pageItems.filter(
      (item) => !shown.has(item.id) && !waiting.has(item.id) && isNewer(item, newest),
    );
    const queued = [...fresh, ...this.queued().filter((item) => present.has(item.id))];
    const queuedIds = new Set(queued.map((item) => item.id));
    this.queued.set(queued);
    this.items.set(pageItems.filter((item) => !queuedIds.has(item.id)));
    this.scheduleRelease();
  }

  private scheduleRelease(): void {
    if (this.releaseTimer !== undefined || this.queued().length === 0) return;
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = undefined;
      const queued = this.queued();
      const next = queued.at(-1);
      if (!next) return;
      this.queued.set(queued.slice(0, -1));
      this.items.update((items) => [next, ...items]);
      this.scheduleRelease();
    }, SLOW_MODE_STEP_MS);
  }

  private clearQueue(): void {
    clearTimeout(this.releaseTimer);
    this.releaseTimer = undefined;
    this.queued.set([]);
  }
}

function isNewer(item: FeedItem, reference: FeedItem): boolean {
  const difference = Date.parse(item.first_seen_at) - Date.parse(reference.first_seen_at);
  return difference > 0 || (difference === 0 && item.id > reference.id);
}
