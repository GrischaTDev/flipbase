import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { ServerStorageService, ServerStorageStatus } from './server-storage.service';

const GIBIBYTE = 1024 ** 3;

@Injectable()
export class ServerStorageState {
  private readonly service = inject(ServerStorageService);
  private readonly destroyRef = inject(DestroyRef);
  private timer?: ReturnType<typeof setTimeout>;
  private pending: Promise<void> | null = null;
  private readonly clock = setInterval(() => this.now.set(Date.now()), 30_000);
  readonly snapshot = signal<ServerStorageStatus | null>(null);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly now = signal(Date.now());
  readonly totalGiB = computed(() => (this.snapshot()?.total_bytes ?? 0) / GIBIBYTE);
  readonly usedGiB = computed(() => (this.snapshot()?.used_bytes ?? 0) / GIBIBYTE);
  readonly availableGiB = computed(() => (this.snapshot()?.available_bytes ?? 0) / GIBIBYTE);
  readonly reservedGiB = computed(() => this.totalGiB() - this.usedGiB() - this.availableGiB());
  readonly usedPercent = computed(() => {
    const snapshot = this.snapshot();
    if (!snapshot) return 0;
    // Wie df: Vom System reservierte Blöcke zählen nicht als verfügbarer Platz.
    const usableBytes = snapshot.used_bytes + snapshot.available_bytes;
    return usableBytes > 0 ? (100 * snapshot.used_bytes) / usableBytes : 0;
  });
  readonly stale = computed(() => {
    const reportedAt = Date.parse(this.snapshot()?.reported_at ?? '');
    return (
      this.error() !== null ||
      !Number.isFinite(reportedAt) ||
      this.now() - reportedAt > 180_000 ||
      reportedAt - this.now() > 30_000
    );
  });
  readonly status = computed(() => {
    if (this.stale()) return { label: 'Messstand unbestätigt', tone: 'caution' as const };
    if (this.usedPercent() >= 90 || this.availableGiB() < 5)
      return { label: 'Speicherplatz kritisch', tone: 'critical' as const };
    if (this.usedPercent() >= 80 || this.availableGiB() < 10)
      return { label: 'Speicherplatz wird knapp', tone: 'caution' as const };
    return { label: 'Genügend Speicherplatz', tone: 'success' as const };
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      clearInterval(this.clock);
      clearTimeout(this.timer);
    });
    void this.refresh();
  }

  refresh(): Promise<void> {
    if (this.destroyRef.destroyed) return Promise.resolve();
    if (this.pending) return this.pending;
    clearTimeout(this.timer);
    this.pending = this.load().finally(() => {
      this.pending = null;
      if (!this.destroyRef.destroyed) this.timer = setTimeout(() => void this.refresh(), 60_000);
    });
    return this.pending;
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.now.set(Date.now());
    try {
      const snapshot = await this.service.load();
      if (this.destroyRef.destroyed) return;
      this.snapshot.set(snapshot);
      this.loaded.set(true);
      this.error.set(null);
    } catch {
      if (!this.destroyRef.destroyed)
        this.error.set('Der Speicherstand konnte nicht geladen werden.');
    } finally {
      if (!this.destroyRef.destroyed) this.loading.set(false);
    }
  }
}
