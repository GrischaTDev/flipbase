import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { SelectOption } from '../../../shared/components/custom-select/custom-select.component';
import type { MarketplaceEntry } from '../models/marketplace-read.models';
import type { VintedListingMetricChange } from '../models/vinted-listing-metric-change';
import type {
  VintedListingStatistics,
  VintedStatisticsPeriod,
} from '../models/vinted-listing-statistics';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceApiService } from './marketplace-api.service';

/** Kontogebundene Vergleiche; verspätete Antworten dürfen weder Zeitraum noch Konto ersetzen. */
@Injectable()
export class MarketplaceListingStatisticsStore {
  private readonly account = inject(MarketplaceAccountStore);
  private readonly api = inject(MarketplaceApiService);
  private readonly result = signal<VintedListingStatistics | null>(null);
  private readonly observations = computed(
    () => new Map(this.result()?.items.map((item) => [item.entryId, item]) ?? []),
  );
  private readonly latestObservation = computed(() =>
    Math.max(0, ...(this.result()?.items.map((item) => Date.parse(item.observedAt)) ?? [])),
  );
  private readonly dateFormat = new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  private readonly selectedPeriod = signal<VintedStatisticsPeriod>(5);
  readonly period = this.selectedPeriod.asReadonly();
  readonly error = signal<string | null>(null);
  readonly options: readonly SelectOption<VintedStatisticsPeriod>[] = [
    { value: 5, label: 'Letzter Abruf', description: 'Standard: alle 5 Minuten' },
    { value: 60, label: 'Stunde' },
    { value: 1440, label: 'Tag' },
    { value: 10080, label: 'Woche' },
  ];
  readonly periodLabel = computed(
    () => this.options.find((option) => option.value === this.period())!.label,
  );
  private readonly requestKey = computed(() => {
    const connection = this.account.selectedConnection();
    const snapshot = this.account.snapshot();
    return connection && snapshot && this.account.canManage()
      ? JSON.stringify([
          connection.workspaceId,
          connection.connectionId,
          this.period(),
          this.account.selectionVersion(),
          snapshot.publications.items.map((entry) => [entry.id, entry.metrics.observedAt]),
        ])
      : null;
  });
  readonly missingHistory = computed(() => {
    const result = this.result();
    return (
      this.matchesSelection(result) &&
      this.account.snapshot()?.publications.items.some((entry) => {
        const item = this.observations().get(entry.id);
        return !item?.baselineAt;
      })
    );
  });
  private revision = 0;
  constructor() {
    effect(() => {
      const key = this.requestKey();
      untracked(() => {
        const revision = ++this.revision;
        this.error.set(null);
        if (!key) {
          this.result.set(null);
          return;
        }
        const connection = this.account.selectedConnection()!;
        const period = this.period();
        if (!this.matchesSelection(this.result())) this.result.set(null);
        void this.api
          .readListingStatistics(connection, period)
          .then((result) => {
            if (revision === this.revision && key === this.requestKey()) this.result.set(result);
          })
          .catch(() => {
            if (revision === this.revision && key === this.requestKey()) {
              this.result.set(null);
              this.error.set('Änderungszahlen konnten nicht geladen werden.');
            }
          });
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.revision++;
    });
  }
  selectPeriod(value: VintedStatisticsPeriod | null): void {
    if (value !== null && this.options.some((option) => option.value === value))
      this.selectedPeriod.set(value);
  }
  change(entry: MarketplaceEntry): VintedListingMetricChange | null {
    const result = this.result();
    if (!this.matchesSelection(result)) return null;
    const item = this.observations().get(entry.id);
    if (
      !item ||
      (this.period() === 5 && Date.parse(item.observedAt) < this.latestObservation()) ||
      Date.parse(item.observedAt) !== Date.parse(entry.metrics.observedAt ?? '') ||
      (!item.views && !item.favorites)
    )
      return null;
    return { views: item.views ?? 0, favorites: item.favorites ?? 0, observedAt: item.observedAt };
  }
  comparisonLabel(entry: MarketplaceEntry): string | null {
    if (!this.matchesSelection(this.result())) return null;
    const item = this.observations().get(entry.id);
    return item?.baselineAt
      ? `Vergleich vom ${this.dateFormat.format(new Date(item.baselineAt))} bis ${this.dateFormat.format(new Date(item.observedAt))}`
      : null;
  }
  private matchesSelection(
    result: VintedListingStatistics | null,
  ): result is VintedListingStatistics {
    const connection = this.account.selectedConnection();
    return (
      !!result &&
      this.account.canManage() &&
      result.workspaceId === connection?.workspaceId &&
      result.connectionId === connection.connectionId &&
      result.periodMinutes === this.period()
    );
  }
}
