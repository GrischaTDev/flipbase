import { computed, signal } from '@angular/core';
import { FeedItem, FeedPage, FeedRequest } from '../models/deal-monitor.model';

/** Ein Kontextwechsel verwirft auch verspätete Antworten des alten Arbeitsbereichs. */
export class DealFeedState {
  readonly items = signal<FeedItem[]>([]);
  readonly paused = signal(false);
  readonly pending = signal<FeedItem[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  readonly covered = signal(false);
  readonly reportedAt = signal<string | null>(null);
  readonly hasMore = signal(false);
  readonly highlights = computed(() => this.items().slice(0, 3));
  readonly grid = computed(() => this.items().slice(3));
  readonly newCount = computed(() => {
    const known = new Set(this.items().map((item) => item.id));
    return this.pending().filter((item) => !known.has(item.id)).length;
  });
  private generation = 0;
  private request: FeedRequest | null = null;
  private busyGeneration: number | null = null;

  constructor(private readonly fetchPage: (request: FeedRequest) => Promise<FeedPage>) {}

  setContext(request: FeedRequest | null): void {
    this.generation++;
    this.request = request;
    this.items.set([]);
    this.pending.set([]);
    this.error.set(null);
    this.loaded.set(false);
    this.loading.set(false);
    this.hasMore.set(false);
    this.covered.set(false);
    this.reportedAt.set(null);
    this.paused.set(false);
    if (request) void this.refresh();
  }

  pause(): void {
    this.paused.set(true);
  }
  resume(): void {
    // Auch einen laufenden Seitenabruf verwerfen, bevor der Zulauf weitergeht.
    this.setContext(this.request);
  }

  async refresh(more = false): Promise<void> {
    const generation = this.generation;
    if (!this.request || this.busyGeneration === generation) return;
    if (more && (!this.hasMore() || this.items().length >= 300)) return;
    this.busyGeneration = generation;
    this.loading.set(true);
    if (more) this.pause();
    const last = this.items().at(-1);
    const request = {
      ...this.request,
      ...(more && last ? { cursor: { time: last.first_seen_at, id: last.id } } : {}),
    };
    try {
      const page = await this.fetchPage(request);
      if (generation !== this.generation) return;
      this.covered.set(page.covered);
      this.reportedAt.set(page.reported_at);
      if (more) {
        const known = new Set(this.items().map((item) => item.id));
        this.items.update((items) =>
          [...items, ...page.items.filter((item) => !known.has(item.id))].slice(0, 300),
        );
        this.hasMore.set(page.items.length === 60 && this.items().length < 300);
      } else if (this.paused() && this.loaded()) {
        this.pending.set(page.items);
      } else {
        this.items.set(page.items);
        this.pending.set([]);
        this.hasMore.set(page.items.length === 60);
      }
      this.loaded.set(true);
      this.error.set(null);
    } catch (error) {
      if (generation === this.generation)
        this.error.set(error instanceof Error ? error.message : 'Laden fehlgeschlagen.');
    } finally {
      if (this.busyGeneration === generation) this.busyGeneration = null;
      if (generation === this.generation) this.loading.set(false);
    }
  }

  destroy(): void {
    this.generation++;
    this.request = null;
  }
}
