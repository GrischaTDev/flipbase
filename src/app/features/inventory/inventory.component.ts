import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideBoxes as Boxes,
  LucideBarcode as Barcode,
  LucideChevronDown as ChevronDown,
  LucideChevronUp as ChevronUp,
  LucidePlus as Plus,
  LucideFilter as Filter,
  LucideSearch as Search,
  LucideTag as Tag,
  LucideEye as Eye,
  LucideArrowRight as ArrowRight,
  LucideTrendingUp as TrendingUp,
  LucideCoins as Coins,
  LucideShieldCheck as ShieldCheck,
  LucideCheckCircle2 as CheckCircle2,
  LucideCamera as Camera,
  LucideSparkles as Sparkles,
  LucidePrinter as Printer,
  LucideCheckSquare as CheckSquare,
  LucideSquare as Square,
  LucideStore as Store,
} from '@lucide/angular';
import { InventoryService } from '../../core/services/inventory.service';
import { ItemCreateModalComponent } from './components/item-create-modal/item-create-modal.component';
import { AiPhotoScannerModalComponent } from '../../shared/components/ai-photo-scanner-modal/ai-photo-scanner-modal.component';
import { InventoryLabelModalComponent } from '../../shared/components/inventory-label-modal/inventory-label-modal.component';
import { AiVisualScanResult } from '../../core/services/ai-assistant.service';
import { InventoryItem, ItemStatus } from '../../core/models/flipbase.models';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { CustomCheckboxComponent } from '../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSearchInputComponent } from '../../shared/components/custom-search-input/custom-search-input.component';
import { BarcodeScannerComponent } from '../../shared/components/barcode-scanner/barcode-scanner.component';
import { NgTemplateOutlet } from '@angular/common';

type FilterPreset = string;

@Component({
  selector: 'app-inventory',
  imports: [
    NgTemplateOutlet,
    BarcodeScannerComponent,
    RouterLink,
    CurrencyPipe,
    TranslatePipe,
    LucideDynamicIcon,
    ItemCreateModalComponent,
    AiPhotoScannerModalComponent,
    InventoryLabelModalComponent,
    CustomSelectComponent,
    CustomCheckboxComponent,
    CustomSearchInputComponent,
  ],
  templateUrl: './inventory.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryComponent {
  readonly inventoryService = inject(InventoryService);
  private readonly router = inject(Router);

  @ViewChild('createModal') createModal?: ItemCreateModalComponent;

  readonly boxesIcon = Boxes;
  readonly plusIcon = Plus;
  readonly filterIcon = Filter;
  readonly searchIcon = Search;
  readonly tagIcon = Tag;
  readonly eyeIcon = Eye;
  readonly arrowRightIcon = ArrowRight;
  readonly trendingIcon = TrendingUp;
  readonly coinsIcon = Coins;
  readonly shieldIcon = ShieldCheck;
  readonly checkIcon = CheckCircle2;
  readonly cameraIcon = Camera;
  readonly sparklesIcon = Sparkles;
  readonly barcodeIcon = Barcode;
  readonly chevronDownIcon = ChevronDown;
  readonly chevronUpIcon = ChevronUp;
  readonly printerIcon = Printer;
  readonly checkSquareIcon = CheckSquare;
  readonly squareIcon = Square;
  readonly storeIcon = Store;

  readonly isCreateModalOpen = signal<boolean>(false);

  /** Scanner zum Auffinden eines Artikels ueber sein gedrucktes Etikett. */
  readonly isScanningLabel = signal<boolean>(false);

  /**
   * Oeffnet den Artikel, dessen Nummer gescannt wurde.
   *
   * Gesucht wird ueber die interne Artikelnummer und ersatzweise ueber die EAN
   * - ein fremder Barcode auf der Ware selbst soll ebenfalls zum Ziel fuehren.
   */
  onEtikettGescannt(code: string): void {
    this.isScanningLabel.set(false);
    const gesucht = code.trim().toUpperCase();

    const treffer = this.inventoryService
      .items()
      .find((i) => i.sku?.toUpperCase() === gesucht || i.ean?.toUpperCase() === gesucht);

    if (treffer) {
      this.router.navigate(['/inventory', treffer.id]);
    } else {
      this.scanMeldung.set(`Kein Artikel mit der Nummer ${code} gefunden.`);
      setTimeout(() => this.scanMeldung.set(null), 5000);
    }
  }

  readonly scanMeldung = signal<string | null>(null);
  readonly isAiScannerOpen = signal<boolean>(false);
  readonly isLabelModalOpen = signal<boolean>(false);
  readonly searchQuery = signal<string>('');
  readonly selectedCondition = signal<string>('all');
  readonly selectedStatus = signal<string>('all');
  readonly activePreset = signal<FilterPreset>('all');
  readonly selectedItemIds = signal<Set<string>>(new Set());

  readonly statusOptions: SelectOption<ItemStatus>[] = [
    {
      value: 'received',
      label: 'Auf Lager',
      badgeClass: 'bg-blue-400',
      colorClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30 hover:bg-blue-500/25',
    },
    {
      value: 'ready',
      label: 'Bereit',
      badgeClass: 'bg-amber-400',
      colorClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25',
    },
    {
      value: 'listed',
      label: 'Gelistet',
      badgeClass: 'bg-emerald-400',
      colorClass:
        'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25',
    },
    {
      value: 'sold',
      label: 'Verkauft',
      badgeClass: 'bg-purple-400',
      colorClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30 hover:bg-purple-500/25',
    },
    {
      value: 'reserved',
      label: 'Reserviert',
      badgeClass: 'bg-slate-400',
      colorClass: 'bg-[#1e222a] text-slate-300 border-[#373e4d] hover:bg-[#282e3a]',
    },
    {
      value: 'defective',
      label: 'Defekt',
      badgeClass: 'bg-rose-400',
      colorClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25',
    },
    {
      value: 'returned',
      label: 'Retourniert',
      badgeClass: 'bg-slate-400',
      colorClass: 'bg-[#1e222a] text-slate-300 border-[#373e4d] hover:bg-[#282e3a]',
    },
    {
      value: 'archived',
      label: 'Archiviert',
      badgeClass: 'bg-slate-400',
      colorClass: 'bg-[#1e222a] text-slate-300 border-[#373e4d] hover:bg-[#282e3a]',
    },
  ];

  readonly filterStatusOptions: SelectOption<string>[] = [
    { value: 'all', label: 'Alle Status' },
    { value: 'received', label: 'Auf Lager', badgeClass: 'bg-blue-400' },
    { value: 'ready', label: 'Bereit', badgeClass: 'bg-amber-400' },
    { value: 'listed', label: 'Gelistet', badgeClass: 'bg-emerald-400' },
    { value: 'sold', label: 'Verkauft', badgeClass: 'bg-purple-400' },
    { value: 'reserved', label: 'Reserviert', badgeClass: 'bg-slate-400' },
    { value: 'defective', label: 'Defekt / Ersatzteil', badgeClass: 'bg-rose-400' },
    { value: 'returned', label: 'Retourniert', badgeClass: 'bg-slate-400' },
    { value: 'archived', label: 'Archiviert', badgeClass: 'bg-slate-400' },
  ];

  readonly filterConditionOptions: SelectOption<string>[] = [
    { value: 'all', label: 'Alle Zustände' },
    { value: 'new', label: 'Neu / OVP' },
    { value: 'like_new', label: 'Wie neu' },
    { value: 'very_good', label: 'Sehr gut' },
    { value: 'used', label: 'Gebraucht' },
    { value: 'heavily_used', label: 'Stark gebraucht' },
    { value: 'defective', label: 'Defekt / Ersatzteil' },
  ];

  readonly storePublishedCount = computed(
    () =>
      this.inventoryService
        .items()
        .filter((i) => i.is_public_store !== false && i.status !== 'sold').length,
  );

  // Filtered Items Computed Signal
  readonly filteredItems = computed(() => {
    let list = this.inventoryService.items();
    const query = this.searchQuery().toLowerCase().trim();

    if (query) {
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          (item.sku && item.sku.toLowerCase().includes(query)) ||
          (item.ean && item.ean.toLowerCase().includes(query)) ||
          (item.brand && item.brand.toLowerCase().includes(query)) ||
          (item.model && item.model.toLowerCase().includes(query)),
      );
    }

    const preset = this.activePreset();
    if (preset === 'store_public') {
      list = list.filter((item) => item.is_public_store !== false && item.status !== 'sold');
    }

    const cond = this.selectedCondition();
    if (cond !== 'all') {
      list = list.filter((item) => item.condition === cond);
    }

    const stat = this.selectedStatus();
    if (stat !== 'all') {
      list = list.filter((item) => item.status === stat);
    }

    return list;
  });

  async onChangeItemStatus(item: InventoryItem, newStatus: ItemStatus | null): Promise<void> {
    if (!newStatus || newStatus === item.status) return;
    await this.inventoryService.updateItemStatus(item.id, newStatus);
  }

  async onTogglePublicStore(item: InventoryItem, event?: Event): Promise<void> {
    event?.stopPropagation();
    event?.preventDefault();
    const nextVal = item.is_public_store === false;
    await this.inventoryService.updateItem(item.id, {
      is_public_store: nextVal,
    });
  }

  /** Welche Gruppen aufgeklappt sind. */
  readonly offeneGruppen = signal<Set<string>>(new Set());

  /**
   * Fasst gleiche Stuecke zu einer Zeile zusammen.
   *
   * Jedes Stueck bleibt ein eigener Artikel - das verlangt die Einzeldifferenz
   * nach § 25a und ist noetig, damit jedes seinen eigenen Zustand, Preis und
   * Verkauf haben kann. Nur die Anzeige fasst zusammen, damit zwanzig gleiche
   * Handyhuellen nicht zwanzig Zeilen belegen. Genau so loesen es
   * Warenwirtschaften fuer Gebrauchtware ueber ihre Seriennummern.
   *
   * Der Status gehoert bewusst zum Gruppenschluessel: Sind drei verkauft und
   * zwei auf Lager, sollen das zwei Zeilen sein - sonst verschwindet die
   * Information, die man beim Blick auf die Liste sucht.
   */
  readonly gruppierteArtikel = computed(() => {
    const gruppen = new Map<string, { schluessel: string; stuecke: InventoryItem[] }>();

    for (const artikel of this.filteredItems()) {
      const schluessel = [
        artikel.title.trim().toLowerCase(),
        artikel.condition,
        artikel.status,
        artikel.purchase_id ?? '',
      ].join('|');

      const vorhandene = gruppen.get(schluessel);
      if (vorhandene) {
        vorhandene.stuecke.push(artikel);
      } else {
        gruppen.set(schluessel, { schluessel, stuecke: [artikel] });
      }
    }

    return [...gruppen.values()];
  });

  istGruppeOffen(schluessel: string): boolean {
    return this.offeneGruppen().has(schluessel);
  }

  toggleGruppe(schluessel: string): void {
    this.offeneGruppen.update((offen) => {
      const neu = new Set(offen);
      if (neu.has(schluessel)) {
        neu.delete(schluessel);
      } else {
        neu.add(schluessel);
      }
      return neu;
    });
  }

  /** Summe eines Feldes ueber alle Stuecke einer Gruppe. */
  gruppenSumme(
    stuecke: InventoryItem[],
    feld: 'allocated_purchase_cost' | 'expected_value',
  ): number {
    return stuecke.reduce((summe, s) => summe + (Number(s[feld]) || 0), 0);
  }

  readonly totalTiedCapital = computed(() =>
    this.filteredItems().reduce((sum, item) => sum + (item.allocated_purchase_cost || 0), 0),
  );

  readonly totalExpectedValue = computed(() =>
    this.filteredItems().reduce((sum, item) => sum + (Number(item.expected_value) || 0), 0),
  );

  readonly totalProfitPotential = computed(() =>
    this.filteredItems().reduce(
      (sum, item) =>
        sum + Math.max(0, (Number(item.expected_value) || 0) - (item.allocated_purchase_cost || 0)),
      0,
    ),
  );

  readonly itemsToPrint = computed<InventoryItem[]>(() => {
    const selected = this.selectedItemIds();
    if (selected.size === 0) {
      return this.filteredItems();
    }
    return this.filteredItems().filter((item) => selected.has(item.id));
  });

  toggleSelectItem(id: string): void {
    const next = new Set(this.selectedItemIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedItemIds.set(next);
  }

  toggleSelectAll(): void {
    const items = this.filteredItems();
    if (this.selectedItemIds().size === items.length && items.length > 0) {
      this.selectedItemIds.set(new Set());
    } else {
      this.selectedItemIds.set(new Set(items.map((i) => i.id)));
    }
  }

  isItemSelected(id: string): boolean {
    return this.selectedItemIds().has(id);
  }

  isAllSelected(): boolean {
    const items = this.filteredItems();
    return items.length > 0 && this.selectedItemIds().size === items.length;
  }

  readonly isIndeterminate = computed(() => {
    const count = this.selectedItemIds().size;
    const total = this.filteredItems().length;
    return count > 0 && count < total;
  });

  openCreateModal(): void {
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  openLabelModal(): void {
    this.isLabelModalOpen.set(true);
  }

  closeLabelModal(): void {
    this.isLabelModalOpen.set(false);
  }

  onAiProductDetected(res: AiVisualScanResult): void {
    this.isAiScannerOpen.set(false);
    this.isCreateModalOpen.set(true);

    // Give modal a tick to render and prefill
    setTimeout(() => {
      if (this.createModal) {
        this.createModal.prefillWithAiResult(res);
      }
    }, 50);
  }

  setPreset(preset: string): void {
    this.activePreset.set(preset);
    if (preset === 'all') {
      this.selectedStatus.set('all');
    } else {
      this.selectedStatus.set(preset);
    }
  }
}
