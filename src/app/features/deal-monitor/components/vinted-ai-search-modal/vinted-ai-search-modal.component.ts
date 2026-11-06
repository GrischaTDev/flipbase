import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { LucideDynamicIcon, LucideSearch, LucideSparkles } from '@lucide/angular';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { FeedItem } from '../../models/deal-monitor.model';
import {
  VintedAiModel,
  VintedAiResult,
  VintedAiUsageSummary,
  resaleEstimate,
} from '../../models/vinted-ai-search';
import { VintedAiSearchService } from '../../services/vinted-ai-search.service';

@Component({
  selector: 'app-vinted-ai-search-modal',
  imports: [
    ModalShellComponent,
    ButtonComponent,
    NumberInputComponent,
    LucideDynamicIcon,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
  ],
  templateUrl: './vinted-ai-search-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedAiSearchModalComponent {
  readonly item = input.required<FeedItem>();
  readonly workspaceId = input.required<string>();
  readonly closed = output<void>();
  private readonly api = inject(VintedAiSearchService);
  readonly result = signal<VintedAiResult | null>(null);
  readonly baseline = signal<VintedAiResult | null>(null);
  readonly stats = signal<VintedAiUsageSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly statsError = signal<string | null>(null);
  readonly shipping = signal<number | null>(0);
  readonly feePercent = signal<number | null>(0);
  readonly otherCosts = signal<number | null>(0);
  readonly searchIcon = LucideSearch;
  readonly sparklesIcon = LucideSparkles;
  readonly estimate = computed(() =>
    resaleEstimate(this.result(), this.shipping(), this.feePercent(), this.otherCosts()),
  );
  readonly labels = {
    manufacturer: 'Hersteller-Neupreis',
    retail: 'Shop-Neupreis',
    sold: 'Verkaufspreis',
    asking: 'Angebotspreis',
  };
  readonly confidenceLabels = {
    exact: 'Modell identifiziert',
    likely: 'Modell vermutlich erkannt',
    unknown: 'Modell nicht eindeutig',
  };
  private generation = 0;

  constructor() {
    effect((onCleanup) => {
      const workspace = this.workspaceId();
      const item = this.item();
      onCleanup(() => this.generation++);
      untracked(() => {
        this.loading.set(false);
        this.result.set(null);
        this.baseline.set(null);
        this.stats.set([]);
        this.statsError.set(null);
        this.shipping.set(0);
        this.feePercent.set(0);
        this.otherCosts.set(0);
        void this.search('gpt-6-luna', workspace, item.id);
      });
    });
  }

  async search(
    model: VintedAiModel,
    workspace = this.workspaceId(),
    listingId = this.item().id,
  ): Promise<void> {
    if (this.loading()) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.search(workspace, listingId, model);
      if (generation !== this.generation) return;
      this.result.set(result);
      if (model === 'gpt-6-luna') this.baseline.set(result);
      this.stats.set(result.stats);
      this.statsError.set(null);
    } catch (error) {
      if (generation !== this.generation) return;
      this.error.set(error instanceof Error ? error.message : 'Die Analyse ist fehlgeschlagen.');
      try {
        const stats = await this.api.usage(workspace);
        if (generation === this.generation) {
          this.stats.set(stats);
          this.statsError.set(null);
        }
      } catch {
        if (generation === this.generation)
          this.statsError.set('Der gespeicherte Verbrauch konnte nicht geladen werden.');
      }
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
}
