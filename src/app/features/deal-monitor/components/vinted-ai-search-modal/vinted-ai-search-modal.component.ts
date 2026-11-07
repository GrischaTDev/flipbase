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
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { FeedItem } from '../../models/deal-monitor.model';
import {
  VintedAiModel,
  VintedAiResult,
  VintedAiUsageSummary,
  resaleEstimate,
  VINTED_AI_MODELS,
} from '../../models/vinted-ai-search';
import { VintedAiSearchService } from '../../services/vinted-ai-search.service';

@Component({
  selector: 'app-vinted-ai-search-modal',
  imports: [
    ModalShellComponent,
    ButtonComponent,
    CustomSelectComponent,
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
  readonly selectedModel = signal<VintedAiModel | null>('gpt-6-luna');
  readonly modelOptions = VINTED_AI_MODELS;
  readonly completedResults = signal<VintedAiResult[]>([]);
  readonly stats = signal<VintedAiUsageSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly statsError = signal<string | null>(null);
  readonly searchIcon = LucideSearch;
  readonly sparklesIcon = LucideSparkles;
  readonly estimate = computed(() => resaleEstimate(this.result()));
  readonly marketSections = computed(() => {
    const analysis = this.result()?.analysis;
    return [
      {
        key: 'retail',
        title: 'Neupreise',
        research: analysis?.research?.retail,
        comparisons:
          analysis?.comparisons.filter((entry) =>
            ['manufacturer', 'retail'].includes(entry.kind),
          ) ?? [],
      },
      {
        key: 'used',
        title: 'Gebrauchtmarkt',
        research: analysis?.research?.used,
        comparisons:
          analysis?.comparisons.filter((entry) => ['sold', 'asking'].includes(entry.kind)) ?? [],
      },
    ];
  });
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
      this.item();
      onCleanup(() => this.generation++);
      untracked(() => {
        this.loading.set(false);
        this.result.set(null);
        this.error.set(null);
        this.selectedModel.set('gpt-6-luna');
        this.completedResults.set([]);
        this.stats.set([]);
        this.statsError.set(null);
        void this.loadUsage(workspace, ++this.generation);
      });
    });
  }

  startSearch(): void {
    const model = this.selectedModel();
    if (model) void this.search(model);
  }

  private async loadUsage(workspace: string, generation: number): Promise<void> {
    try {
      const stats = await this.api.usage(workspace);
      if (generation === this.generation) this.stats.set(stats);
    } catch {
      if (generation === this.generation)
        this.statsError.set('Der gespeicherte Verbrauch konnte nicht geladen werden.');
    }
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
      this.completedResults.update((results) => [
        ...results.filter((entry) => entry.model !== result.model),
        result,
      ]);
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
