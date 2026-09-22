import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideSearch as Search,
  LucideSparkles as Sparkles,
  LucideZap as Zap,
  LucideTag as Tag,
  LucideCalculator as Calculator,
  LucideExternalLink as ExternalLink,
  LucidePlusCircle as PlusCircle,
  LucideTrendingUp as TrendingUp,
  LucideTrendingDown as TrendingDown,
  LucideAlertCircle as AlertCircle,
  LucideCheckCircle2 as CheckCircle2,
  LucideSliders as Sliders,
  LucideHistory as History,
  LucideShieldCheck as ShieldCheck,
  LucidePercent as Percent,
  LucideCamera as Camera,
  LucideBoxes as Boxes,
  LucideLayers as Layers,
  LucideLayoutGrid as LayoutGrid,
  LucideList as List,
  LucideImage as ImageIcon,
  LucideEye as Eye,
  LucideX as X,
  LucidePlus as Plus,
  LucideRadio as Radio,
  LucideRefreshCw as RefreshCw,
  LucideTrash2 as Trash2,
} from '@lucide/angular';
import {
  ResearchService,
  ResearchComparisonItem,
  ResearchSummary,
} from '../../core/services/research.service';
import { BarcodeLookupService } from '../../core/services/barcode-lookup.service';
import { PriceTrackerService } from '../../core/services/price-tracker.service';
import { BarcodeScannerComponent } from '../../shared/components/barcode-scanner/barcode-scanner.component';
import { ModalShellComponent } from '../../shared/components/modal-shell/modal-shell.component';
import { NumberInputComponent } from '../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../shared/components/text-field/text-field.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ToastService } from '../../shared/components/toast/toast.service';

@Component({
  selector: 'app-research',
  imports: [
    ModalShellComponent,
    NumberInputComponent,
    TextFieldComponent,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    TranslatePipe,
    LucideDynamicIcon,
    BarcodeScannerComponent,
    CustomSelectComponent,
  ],
  templateUrl: './research.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResearchComponent {
  /**
   * Vorgaben fuer das eigene Auswahlfeld.
   *
   * Ein natives Auswahlfeld klappt eine Liste auf, die das Betriebssystem
   * zeichnet - hell, mit fremder Schrift. Deshalb uebernimmt
   * `app-custom-select`, und die Eintraege stehen hier.
   */
  readonly zustandsOptionen: SelectOption<string>[] = [
    { value: 'new', label: 'Neu / OVP' },
    { value: 'like_new', label: 'Wie neu' },
    { value: 'very_good', label: 'Sehr gut' },
    { value: 'used', label: 'Gebraucht' },
    { value: 'heavily_used', label: 'Stark gebraucht' },
    { value: 'defective', label: 'Defekt' },
  ];

  readonly researchService = inject(ResearchService);
  readonly priceTrackerService = inject(PriceTrackerService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly toast = inject(ToastService);
  private readonly barcodeLookup = inject(BarcodeLookupService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly searchIcon = Search;
  readonly sparklesIcon = Sparkles;
  readonly zapIcon = Zap;
  readonly tagIcon = Tag;
  readonly calcIcon = Calculator;
  readonly linkIcon = ExternalLink;
  readonly plusIcon = PlusCircle;
  readonly trendingIcon = TrendingUp;
  readonly trendingDownIcon = TrendingDown;
  readonly alertIcon = AlertCircle;
  readonly checkIcon = CheckCircle2;
  readonly slidersIcon = Sliders;
  readonly historyIcon = History;
  readonly shieldIcon = ShieldCheck;
  readonly percentIcon = Percent;
  readonly cameraIcon = Camera;
  readonly boxesIcon = Boxes;
  readonly layersIcon = Layers;
  readonly gridIcon = LayoutGrid;
  readonly listIcon = List;
  readonly imageIcon = ImageIcon;
  readonly eyeIcon = Eye;
  readonly closeIcon = X;
  readonly addMoreIcon = Plus;
  readonly radarIcon = Radio;
  readonly radioIcon = Radio;
  readonly refreshIcon = RefreshCw;
  readonly trashIcon = Trash2;

  readonly activeTab = signal<'search' | 'radar'>('search');
  readonly isScanningBarcode = signal<boolean>(false);
  readonly selectedPlatformFilter = signal<'all' | 'ebay_sold' | 'kleinanzeigen' | 'vinted'>('all');
  readonly viewMode = signal<'grid' | 'table'>('grid');
  readonly previewImageUrl = signal<string | null>(null);
  readonly isRadarMutationPending = signal<boolean>(false);

  readonly searchForm = new FormGroup({
    query: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    condition: new FormControl('used', { nonNullable: true }),
    estimatedCost: new FormControl<number>(25.0, { nonNullable: true }),
    limit: new FormControl<number>(24, { nonNullable: true }),
  });

  readonly summary = signal<ResearchSummary | null>(null);
  readonly hasSearched = signal<boolean>(false);

  readonly filteredComparisonItems = computed(() => {
    const items = this.researchService.currentComparisonItems();
    const filter = this.selectedPlatformFilter();
    if (filter === 'all') return items;
    return items.filter((i) => i.source === filter);
  });

  constructor() {
    this.route.queryParams.subscribe((params) => {
      const q = params['query'];
      const tab = params['tab'];
      if (tab === 'radar') {
        this.activeTab.set('radar');
      }
      if (q) {
        this.searchForm.patchValue({ query: q });
        this.onSearch();
      }
    });
  }

  async onBarcodeScanned(ean: string): Promise<void> {
    this.isScanningBarcode.set(false);
    const info = await this.barcodeLookup.lookupByEan(ean);
    if (info) {
      this.searchForm.patchValue({ query: info.title });
      this.onSearch();
    }
  }

  async onSearch(): Promise<void> {
    const f = this.searchForm.getRawValue();
    if (!f.query.trim()) return;

    this.hasSearched.set(true);
    const { summary } = await this.researchService.executeResearch(
      f.query.trim(),
      f.condition,
      f.estimatedCost,
      f.limit,
    );
    this.summary.set(summary);
  }

  async loadMore(): Promise<void> {
    const currentLimit = this.searchForm.get('limit')?.value || 24;
    const newLimit = currentLimit + 12;
    this.searchForm.patchValue({ limit: newLimit });
    await this.onSearch();
  }

  onToggleItem(item: ResearchComparisonItem): void {
    this.researchService.toggleExcludeItem(item.id);
    const f = this.searchForm.getRawValue();
    const updatedSummary = this.researchService.calculateSummary(
      this.researchService.currentComparisonItems(),
      f.estimatedCost,
      f.query,
    );
    this.summary.set(updatedSummary);
  }

  openInDealCalculator(): void {
    const s = this.summary();
    const f = this.searchForm.getRawValue();
    if (!s) return;

    this.router.navigate(['/deal-calculator'], {
      queryParams: {
        itemTitle: f.query,
        buyPrice: f.estimatedCost,
        expectedPrice: s.medianPrice,
      },
    });
  }

  // Radar Methods
  async onScanRadarLive(id?: string): Promise<void> {
    await this.priceTrackerService.scanMarketLive(id);
  }

  async onApplyRadarPrice(id: string): Promise<void> {
    try {
      const ok = await this.priceTrackerService.applyRecommendedPrice(id);
      if (!ok) return;
      this.toast.success('Preisempfehlung wurde übernommen.');
    } catch (error: unknown) {
      if (this.syncStatus.istZentralGemeldet(error)) return;
      this.toast.error(
        'Preisempfehlung konnte nicht übernommen werden.',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  onToggleTrackItem(id: string): void {
    this.priceTrackerService.toggleTracking(id);
  }

  async onDeleteTrackItem(id: string): Promise<void> {
    if (this.isRadarMutationPending()) return;
    this.isRadarMutationPending.set(true);
    try {
      const result = await this.priceTrackerService.deleteTrackedItem(id);
      if (result.error) {
        if (!result.reportedBySyncStatus) {
          this.toast.error('Preisbeobachtung konnte nicht gelöscht werden.', result.error.message);
        }
        return;
      }
      this.toast.success('Preisbeobachtung wurde gelöscht.');
    } catch (error: unknown) {
      if (!this.syncStatus.istZentralGemeldet(error)) {
        this.toast.error(
          'Preisbeobachtung konnte nicht gelöscht werden.',
          error instanceof Error ? error.message : String(error),
        );
      }
    } finally {
      this.isRadarMutationPending.set(false);
    }
  }

  async onAddCurrentSearchToRadar(): Promise<void> {
    const f = this.searchForm.getRawValue();
    const s = this.summary();
    if (!f.query.trim() || this.isRadarMutationPending()) return;

    this.isRadarMutationPending.set(true);
    try {
      const result = await this.priceTrackerService.addTrackedItem({
        title: f.query.trim(),
        price: s?.medianPrice || f.estimatedCost * 1.5,
        category: 'Recherche',
      });
      if (result.error) {
        if (!result.reportedBySyncStatus) {
          this.toast.error('Preisbeobachtung konnte nicht angelegt werden.', result.error.message);
        }
        return;
      }
      this.activeTab.set('radar');
      this.toast.success('Preisbeobachtung wurde angelegt.');
    } catch (error: unknown) {
      if (!this.syncStatus.istZentralGemeldet(error)) {
        this.toast.error(
          'Preisbeobachtung konnte nicht angelegt werden.',
          error instanceof Error ? error.message : String(error),
        );
      }
    } finally {
      this.isRadarMutationPending.set(false);
    }
  }
}
