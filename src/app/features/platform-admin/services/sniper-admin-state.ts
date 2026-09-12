import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { SniperAdminService } from './sniper-admin.service';
import { SniperQuery, SniperRuntimeStatus } from '../models/sniper-query.model';

/** Seitenlokal: ein laufender Abruf, naechster Takt erst nach Abschluss. */
@Injectable()
export class SniperAdminState {
  private readonly api = inject(SniperAdminService);
  private readonly destroyRef = inject(DestroyRef);
  private timer?: ReturnType<typeof setTimeout>;
  private pending: Promise<void> | null = null;
  readonly queries = signal<SniperQuery[]>([]);
  readonly runtime = signal<SniperRuntimeStatus | null>(null);
  readonly counts = signal<Partial<Record<string, number>>>({});
  readonly error = signal<string | null>(null);
  readonly loaded = signal(false);
  readonly now = signal(Date.now());
  readonly stale = computed(
    () => !this.runtime() || this.now() - Date.parse(this.runtime()!.reported_at) > 120_000,
  );
  readonly plannedRate = computed(() =>
    this.queries()
      .filter((q) => q.is_active)
      .reduce((sum, q) => sum + 60_000 / q.poll_interval_ms, 0),
  );

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.timer));
    void this.refresh();
  }

  refresh(): Promise<void> {
    if (this.destroyRef.destroyed) return Promise.resolve();
    if (this.pending) return this.pending;
    clearTimeout(this.timer);
    this.pending = this.load().finally(() => {
      this.pending = null;
      if (!this.destroyRef.destroyed) this.timer = setTimeout(() => void this.refresh(), 10_000);
    });
    return this.pending;
  }

  async refreshAfterMutation(): Promise<void> {
    // Ein Abruf, der schon vor dem Speichern startete, kann noch alte Zeilen liefern.
    if (this.pending) await this.pending;
    await this.refresh();
  }

  private async load(): Promise<void> {
    this.now.set(Date.now());
    try {
      const [queries, runtime, counts] = await Promise.all([
        this.api.list(),
        this.api.runtime(),
        this.api.counts(),
      ]);
      if (this.destroyRef.destroyed) return;
      this.queries.set(queries);
      this.runtime.set(runtime);
      this.counts.set(counts);
      this.loaded.set(true);
      this.error.set(null);
    } catch (error) {
      if (!this.destroyRef.destroyed)
        this.error.set(
          error instanceof Error ? error.message : 'Der Botstand konnte nicht geladen werden.',
        );
    }
  }
}
