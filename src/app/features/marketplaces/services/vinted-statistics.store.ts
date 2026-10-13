import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type {
  VintedStatisticsOverview,
  VintedStatisticsRange,
  VintedStatisticsRequestScope,
} from '../models/vinted-statistics-overview';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { MarketplaceApiService } from './marketplace-api.service';

export type VintedStatisticsAccountScope = 'account' | 'all';

interface StatisticsRequest {
  readonly scope: VintedStatisticsRequestScope;
  readonly range: VintedStatisticsRange;
  /** Wessen Zahlen gezeigt werden: Workspace, Konto, Zeitraum und Auswahlversion. */
  readonly selection: string;
  /** Zusätzlich Neuladen und Messzeitpunkte: bestimmt, wann erneut geladen wird. */
  readonly key: string;
}

/** Zustand der Statistikseite; verspätete Antworten dürfen weder Konto noch Zeitraum ersetzen. */
@Injectable()
export class VintedStatisticsStore {
  private readonly account = inject(MarketplaceAccountStore);
  private readonly api = inject(MarketplaceApiService);
  private readonly requestedAccountScope = signal<VintedStatisticsAccountScope>('account');
  private readonly selectedRange = signal<VintedStatisticsRange>('7d');
  private readonly reloads = signal(0);
  private readonly result = signal<{
    selection: string;
    key: string;
    overview: VintedStatisticsOverview;
  } | null>(null);
  private readonly failedKey = signal<string | null>(null);
  private revision = 0;

  readonly range = this.selectedRange.asReadonly();
  readonly canCombineAccounts = computed(() => this.account.connections().length > 1);
  readonly accountScope = computed<VintedStatisticsAccountScope>(() =>
    this.canCombineAccounts() ? this.requestedAccountScope() : 'account',
  );
  // Solange der Kontostand noch lädt, stünde der Abruf sofort wieder zur Wiederholung an.
  private readonly waitingForAccount = computed(
    () => this.account.loadingSnapshot() && !this.account.snapshot(),
  );
  // Gleicher Schlüssel heißt gleiche Anfrage: fremde Kontoänderungen lösen keinen neuen Abruf aus.
  private readonly request = computed<StatisticsRequest | null>(
    () => {
      const connection = this.account.selectedConnection();
      if (!connection || !this.account.canManage() || this.waitingForAccount()) return null;
      const scope: VintedStatisticsRequestScope = {
        workspaceId: connection.workspaceId,
        connectionId: this.accountScope() === 'all' ? null : connection.connectionId,
      };
      const range = this.range();
      // Ein neuer Abruf ändert die Messzeitpunkte und lädt die Statistik neu. Für alle Konten
      // zählt der letzte Abruf jedes Kontos, sonst nur der des gewählten.
      const observed =
        scope.connectionId === null
          ? this.account
              .connections()
              .map((item) => item.lastSyncedAt)
              .join(',')
          : this.account
              .snapshot()
              ?.publications.items.map((entry) => entry.metrics.observedAt)
              .join(',');
      const selection = JSON.stringify([
        scope.workspaceId,
        scope.connectionId,
        range,
        this.account.selectionVersion(),
      ]);
      return {
        scope,
        range,
        selection,
        key: JSON.stringify([selection, this.reloads(), observed ?? null]),
      };
    },
    { equal: (left, right) => left?.key === right?.key },
  );
  // Neuladen und neue Messzeitpunkte behalten die sichtbaren Zahlen, bis die Antwort da ist.
  readonly overview = computed(() => {
    const result = this.result();
    return result && result.selection === this.request()?.selection ? result.overview : null;
  });
  readonly error = computed(() =>
    this.request() && this.failedKey() === this.request()!.key
      ? 'Die Statistik konnte nicht geladen werden.'
      : null,
  );
  readonly loading = computed(() => {
    const request = this.request();
    if (!request) return this.waitingForAccount() && this.account.canManage();
    return this.result()?.key !== request.key && this.failedKey() !== request.key;
  });

  constructor() {
    effect(() => {
      const request = this.request();
      untracked(() => {
        const revision = ++this.revision;
        if (!request) {
          this.result.set(null);
          this.failedKey.set(null);
          return;
        }
        void this.api
          .readStatisticsOverview(request.scope, request.range)
          .then((overview) => {
            if (revision !== this.revision) return;
            this.failedKey.set(null);
            this.result.set({ selection: request.selection, key: request.key, overview });
          })
          .catch(() => {
            if (revision !== this.revision) return;
            // Scheitert nur die Aktualisierung, bleiben die Zahlen derselben Auswahl stehen.
            if (this.result()?.selection !== request.selection) this.result.set(null);
            this.failedKey.set(request.key);
          });
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.revision++;
    });
  }

  selectAccountScope(scope: VintedStatisticsAccountScope): void {
    this.requestedAccountScope.set(scope);
  }
  selectRange(range: VintedStatisticsRange): void {
    this.selectedRange.set(range);
  }
  reload(): void {
    this.reloads.update((count) => count + 1);
  }
}
