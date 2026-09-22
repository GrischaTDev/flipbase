import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  LucideDynamicIcon,
  LucideArrowLeft as ArrowLeft,
  LucideBoxes as Boxes,
  LucideTag as Tag,
  LucideSearch as Search,
  LucideSparkles as Sparkles,
  LucideDollarSign as DollarSign,
  LucideTrash2 as Trash2,
  LucidePencil as Pencil,
  LucidePlus as Plus,
  LucideWrench as Wrench,
  LucideClock as Clock,
  LucideExternalLink as ExternalLink,
  LucideHistory as History,
  LucideCheckCircle2 as CheckCircle2,
  LucideImage as ImageIcon,
  LucideUpload as Upload,
  LucideStar as Star,
  LucideEye as Eye,
  LucideFileText as FileText,
  LucideX as X,
  LucideStore as Store,
  LucidePrinter as Printer,
} from '@lucide/angular';
import { InventoryService } from '../../../../core/services/inventory.service';
import { MediaService } from '../../../../core/services/media.service';
import { InventoryLabelModalComponent } from '../../../../shared/components/inventory-label-modal/inventory-label-modal.component';
import { InventoryItem, ItemMedia, ItemStatus } from '../../../../core/models/flipbase.models';
import { isInventoryItemMutationLocked } from '../../../../core/models/inventory-sellability';
import { SaleTargetRouteState } from '../../../../core/models/sale-target.models';

import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ItemCreateModalComponent } from '../../components/item-create-modal/item-create-modal.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../../../core/services/sync-status.service';
import { SalesService } from '../../../../core/services/sales.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import {
  CostStateComponent,
  CostState,
} from '../../../../shared/components/cost-state/cost-state.component';
import { ItemConditionLabelPipe } from '../../../../shared/pipes/item-condition-label.pipe';
import {
  buildInventoryPresentation,
  InventorySourceState,
} from '../../utils/inventory-presentation';
import { editableItemStatusOptions } from '../../models/item-status-options';
import { RecordHistoryContainer } from '../../../audit/components/record-history/record-history.container';

import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';

const purchaseReturnPath = /^\/purchases\/([A-Za-z0-9_-]+)$/;

export function validatePurchaseReturnTo(value: string | null | undefined): string | null {
  if (!value || value.includes('\\') || value.includes('?') || value.includes('#')) return null;
  const match = purchaseReturnPath.exec(value);
  if (!match || match[1] === '.' || match[1] === '..') return null;
  return value;
}

@Component({
  selector: 'app-item-detail',
  imports: [
    ItemCreateModalComponent,
    ModalDialogDirective,
    RouterLink,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    LucideDynamicIcon,
    InventoryLabelModalComponent,
    CustomSelectComponent,
    CostStateComponent,
    RecordHistoryContainer,
    ItemConditionLabelPipe,
    PageHeaderComponent,
    TwoColumnLayoutComponent,
    CardComponent,
    BadgeComponent,
    ButtonComponent,
    NumberInputComponent,
    TextFieldComponent,
  ],
  templateUrl: './item-detail.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemDetailComponent {
  isMutationLocked(item: InventoryItem): boolean {
    return isInventoryItemMutationLocked(item);
  }
  /**
   * Vorgaben fuer das eigene Auswahlfeld.
   *
   * Ein natives Auswahlfeld klappt eine Liste auf, die das Betriebssystem
   * zeichnet - hell, mit fremder Schrift. Deshalb uebernimmt
   * `app-custom-select`, und die Eintraege stehen hier.
   */
  readonly kostenartOptionen: SelectOption<string>[] = [
    { value: 'repair', label: 'Reparatur' },
    { value: 'cleaning', label: 'Reinigung' },
    { value: 'spare_parts', label: 'Ersatzteile' },
    { value: 'accessories', label: 'Zubehör' },
    { value: 'packaging', label: 'Verpackung' },
    { value: 'other', label: 'Sonstiges' },
  ];

  readonly id = input.required<string>();

  private readonly dialog = inject(ConfirmDialogService);
  readonly inventoryService = inject(InventoryService);
  readonly mediaService = inject(MediaService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly toast = inject(ToastService);
  readonly salesService = inject(SalesService);
  private readonly workspaceService = inject(WorkspaceService);

  readonly currentItem = computed<InventoryItem | null>(() => {
    const item = this.inventoryService.selectedItem();
    return item?.id === this.id() ? item : null;
  });

  readonly arrowLeftIcon = ArrowLeft;
  readonly boxesIcon = Boxes;
  readonly tagIcon = Tag;
  readonly searchIcon = Search;
  readonly sparklesIcon = Sparkles;
  readonly dollarIcon = DollarSign;
  readonly trashIcon = Trash2;
  readonly editIcon = Pencil;
  readonly plusIcon = Plus;
  readonly wrenchIcon = Wrench;
  readonly clockIcon = Clock;
  readonly linkIcon = ExternalLink;
  readonly historyIcon = History;
  readonly checkIcon = CheckCircle2;
  readonly imageIcon = ImageIcon;
  readonly uploadIcon = Upload;
  readonly storeIcon = Store;
  readonly starIcon = Star;
  readonly eyeIcon = Eye;
  readonly fileIcon = FileText;
  readonly closeIcon = X;
  readonly printerIcon = Printer;

  readonly isAddingCost = signal<boolean>(false);
  readonly isEditModalOpen = signal<boolean>(false);
  readonly isLabelModalOpen = signal<boolean>(false);
  readonly mediaList = signal<ItemMedia[]>([]);
  readonly isUploading = signal<boolean>(false);
  readonly uploadError = signal<string | null>(null);
  readonly previewModalUrl = signal<string | null>(null);
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly backTarget = computed(() => {
    if (this.queryParams().get('returnTo') === '/catalog') return '/catalog';
    const returnTo = validatePurchaseReturnTo(this.queryParams().get('returnTo'));
    const item = this.currentItem();
    return returnTo && item?.purchase_id && returnTo === `/purchases/${item.purchase_id}`
      ? returnTo
      : '/inventory';
  });
  readonly backLabel = computed(() =>
    this.backTarget() === '/catalog'
      ? 'Zurück zu allen Artikeln'
      : this.backTarget() === '/inventory'
        ? 'Zurück zum Bestand'
        : 'Zurück zum Einkauf',
  );

  readonly detailPresentation = computed(() => {
    const item = this.inventoryService.selectedItem();
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!item || !workspaceId || item.workspace_id !== workspaceId) return null;
    const salesState: InventorySourceState = this.salesService.loadError()
      ? 'error'
      : this.salesService.loadedWorkspaceId() === workspaceId && !this.salesService.isLoading()
        ? 'known'
        : 'loading';
    return (
      buildInventoryPresentation({
        workspaceId,
        inventoryState: 'known',
        stockState: 'known',
        purchaseState: item.purchase ? 'known' : 'loading',
        salesState,
        individualItems: [item],
        positions: [],
        lots: [],
        movements: [],
        purchases: item.purchase ? [item.purchase] : [],
        sales: this.salesService.sales(),
      }).rows[0] ?? null
    );
  });

  readonly additionalCostState = computed<CostState>(() => {
    const item = this.inventoryService.selectedItem();
    const row = this.detailPresentation();
    if (!item || item.allocated_purchase_cost == null || !row || row.costPerUnit.kind === 'open')
      return { kind: 'open' };
    return {
      kind: 'known',
      amount: Number(Math.max(0, row.costPerUnit.amount - item.allocated_purchase_cost).toFixed(2)),
    };
  });

  readonly purchaseCostShareState = computed<CostState>(() => {
    const item = this.inventoryService.selectedItem();
    const row = this.detailPresentation();
    if (!item || item.allocated_purchase_cost == null || !row || row.costPerUnit.kind === 'open')
      return { kind: 'open' };
    return { kind: 'known', amount: item.allocated_purchase_cost };
  });

  readonly costForm = new FormGroup({
    type: new FormControl('repair', { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl<number>(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.01)],
    }),
    description: new FormControl(''),
  });

  readonly statusOptions: SelectOption<ItemStatus>[] = [...editableItemStatusOptions];

  constructor() {
    effect(() => {
      const itemId = this.id();
      this.resetRouteLocalState();
      if (itemId) {
        this.inventoryService.getItemById(itemId);
        this.loadMedia(itemId);
      }
    });
  }

  async loadMedia(itemId: string): Promise<void> {
    if (this.id() !== itemId) return;
    this.mediaList.set([]);
    const list = await this.mediaService.loadItemMedia(itemId);
    if (this.id() !== itemId) return;
    this.mediaList.set(list.filter((medium) => medium.inventory_item_id === itemId));
  }

  async onFilesSelected(event: Event): Promise<void> {
    const item = this.currentItem();
    if (!item || this.isMutationLocked(item)) return;
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const itemId = item.id;

    this.isUploading.set(true);
    this.uploadError.set(null);

    const files = Array.from(input.files);
    const fehlerAktion = this.syncStatus.neueFehlerAktion();
    let brauchtHauptbild = this.mediaList().length === 0;
    let ersterFehler: Error | null = null;
    const uploadFehler: Error[] = [];
    let erfolgreicheUploads = 0;
    let fehlgeschlageneUploads = 0;
    let unerwarteterFehler: Error | null = null;

    try {
      for (const file of files) {
        const isPrimary = brauchtHauptbild;
        const { data, error } = await this.mediaService.uploadItemMedia(
          itemId,
          file,
          isPrimary,
          fehlerAktion,
        );
        if (error) {
          if (this.isCurrentRouteItem(itemId)) this.uploadError.set(error.message);
          ersterFehler ??= error;
          uploadFehler.push(error);
          fehlgeschlageneUploads++;
        } else if (data?.inventory_item_id === itemId) {
          if (this.isCurrentRouteItem(itemId)) {
            this.mediaList.update((prev) => [data, ...prev]);
          }
          erfolgreicheUploads++;
          brauchtHauptbild = false;
        } else {
          const fehler = new Error(
            data
              ? 'Das Bild wurde einem anderen Artikel zugeordnet.'
              : 'Das Bild wurde nicht zurückgegeben.',
          );
          if (this.isCurrentRouteItem(itemId)) this.uploadError.set(fehler.message);
          ersterFehler ??= fehler;
          uploadFehler.push(fehler);
          fehlgeschlageneUploads++;
        }
      }
    } catch (ursache) {
      unerwarteterFehler = this.alsError(ursache);
    } finally {
      this.syncStatus.beendeFehlerAktion(fehlerAktion);
      if (this.isCurrentRouteItem(itemId)) this.isUploading.set(false);
      input.value = '';
    }

    if (!this.isCurrentRouteItem(itemId)) return;

    if (unerwarteterFehler) {
      this.uploadError.set(unerwarteterFehler.message);
      this.meldeFehlerWennNichtSynchronisiert(
        'Bild konnte nicht hochgeladen werden.',
        unerwarteterFehler,
      );
      return;
    }

    const lokaleUploadFehler = uploadFehler.filter(
      (error) => !this.syncStatus.istZentralGemeldet(error),
    );
    if (erfolgreicheUploads === 0 && ersterFehler) {
      if (files.length > 1 && lokaleUploadFehler.length > 0) {
        this.toast.warning(
          `0 von ${files.length} Bildern wurden hochgeladen.`,
          this.beschreibeFehlgeschlageneBilder(lokaleUploadFehler.length),
        );
        return;
      }
      this.meldeFehlerWennNichtSynchronisiert(
        files.length === 1
          ? 'Bild konnte nicht hochgeladen werden.'
          : 'Bilder konnten nicht hochgeladen werden.',
        ersterFehler,
      );
      return;
    }
    if (fehlgeschlageneUploads > 0) {
      const title =
        erfolgreicheUploads === 1
          ? `1 von ${files.length} Bildern wurde hochgeladen.`
          : `${erfolgreicheUploads} von ${files.length} Bildern wurden hochgeladen.`;
      const description = this.beschreibeFehlgeschlageneBilder(lokaleUploadFehler.length);
      if (lokaleUploadFehler.length > 0) {
        this.toast.warning(title, description);
      }
      return;
    }
    this.toast.success(
      files.length === 1 ? 'Bild wurde hochgeladen.' : 'Bilder wurden hochgeladen.',
    );
  }

  async onSetPrimary(media: ItemMedia): Promise<void> {
    const item = this.currentItem();
    if (!item || this.isMutationLocked(item) || !this.isOwnedMedia(item.id, media)) return;

    const { error } = await this.mediaService.setPrimary(item.id, media.id);
    if (!this.isOwnedMedia(item.id, media)) return;
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert('Hauptbild konnte nicht geändert werden.', error);
      return;
    }
    this.mediaList.update((prev) => prev.map((m) => ({ ...m, is_primary: m.id === media.id })));
    this.toast.success('Hauptbild wurde geändert.');
  }

  async onDeleteMedia(media: ItemMedia): Promise<void> {
    const item = this.currentItem();
    if (!item || this.isMutationLocked(item) || !this.isOwnedMedia(item.id, media)) return;

    const { error } = await this.mediaService.deleteMedia(item.id, media.id);
    if (!this.isOwnedMedia(item.id, media)) return;
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert('Bild konnte nicht gelöscht werden.', error);
      return;
    }
    this.mediaList.update((prev) => prev.filter((m) => m.id !== media.id));
    this.toast.success('Bild wurde gelöscht.');
  }

  getMediaUrl(path: string): string {
    return this.mediaService.getMediaUrl(path);
  }

  async onChangeStatus(newStatus: string | null): Promise<void> {
    if (!newStatus) return;
    const item = this.currentItem();
    if (!item || this.isMutationLocked(item)) return;
    const { error } = await this.inventoryService.updateItemStatus(
      item.id,
      newStatus as ItemStatus,
    );
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert('Artikelstatus konnte nicht geändert werden.', error);
      return;
    }
    this.toast.success('Artikelstatus wurde geändert.');
  }

  async onRestoreLegacySoldItem(): Promise<void> {
    const item = this.currentItem();
    if (!item || item.sale_state !== 'legacy_sold_unverified') return;

    const confirmed = await this.dialog.frage({
      titel: 'Artikel wieder in Bestand nehmen?',
      text: `„${item.title}“ wird auf „Bereit“ gesetzt. Die Korrektur wird automatisch dokumentiert.`,
      bestaetigenText: 'Artikel ist noch vorhanden',
    });
    if (!confirmed || !this.isCurrentItem(item)) return;

    const { error } = await this.inventoryService.resolveLegacySoldItem(item.id);
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert('Verkaufsstatus konnte nicht geklärt werden.', error);
      return;
    }
    this.toast.success('Artikel wurde wieder in den Bestand aufgenommen.');
  }

  openLegacySaleReconciliation(): void {
    const item = this.currentItem();
    if (!item || item.sale_state !== 'legacy_sold_unverified') return;
    const state: SaleTargetRouteState = {
      legacyReconciliation: {
        kind: 'legacy_sold_unverified',
        inventoryItemId: item.id,
      },
      saleTarget: { kind: 'inventory_item', inventoryItemId: item.id, title: item.title },
      returnUrl: `/inventory/${item.id}`,
    };
    void this.router.navigate(['/sales/new'], {
      state,
    });
  }

  async onAddCost(): Promise<void> {
    const item = this.currentItem();
    if (!item || this.isMutationLocked(item) || this.costForm.invalid) return;

    const val = this.costForm.getRawValue();
    const { error } = await this.inventoryService.addItemCost(
      item.id,
      val.type,
      val.amount,
      val.description || undefined,
    );

    if (error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Artikelkosten konnten nicht gespeichert werden.',
        error,
      );
      return;
    }

    this.costForm.reset({ type: 'repair', amount: 0, description: '' });
    this.isAddingCost.set(false);
    this.toast.success('Artikelkosten wurden hinzugefügt.');
  }

  async onDeleteCost(costId: string): Promise<void> {
    const item = this.currentItem();
    if (!item || this.isMutationLocked(item)) return;
    const { error } = await this.inventoryService.deleteItemCost(item.id, costId);
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert(
        'Artikelkosten konnten nicht gelöscht werden.',
        error,
      );
      return;
    }
    this.toast.success('Artikelkosten wurden gelöscht.');
  }

  async onTogglePublicStore(isPublic: boolean): Promise<void> {
    const item = this.currentItem();
    if (!item || this.isMutationLocked(item)) return;
    const { error } = await this.inventoryService.updateItem(item.id, {
      is_public_store: isPublic,
    });
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert('Shop-Freigabe konnte nicht geändert werden.', error);
      return;
    }
    this.toast.success(
      isPublic ? 'Artikel wurde im Shop veröffentlicht.' : 'Artikel wurde aus dem Shop entfernt.',
    );
  }

  async onDeleteItem(): Promise<void> {
    const item = this.currentItem();
    if (!item || this.isMutationLocked(item)) return;
    const bestaetigt = await this.dialog.frage({
      titel: 'Artikel löschen?',
      text: `„${item.title}“ wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.`,
      bestaetigenText: 'Löschen',
      gefahr: true,
    });
    if (!bestaetigt || !this.isCurrentItem(item)) return;

    const { error } = await this.inventoryService.deleteItem(item.id);
    if (error) {
      this.meldeFehlerWennNichtSynchronisiert('Artikel konnte nicht gelöscht werden.', error);
      return;
    }
    this.toast.success('Artikel wurde gelöscht.');
    await this.router.navigate(['/inventory']);
  }

  openEditModal(): void {
    const item = this.currentItem();
    if (!item || this.isMutationLocked(item)) return;
    this.isEditModalOpen.set(true);
  }

  private isCurrentItem(item: InventoryItem): boolean {
    const currentItem = this.currentItem();
    return currentItem?.id === item.id && currentItem.sale_state === item.sale_state;
  }

  private isCurrentRouteItem(itemId: string): boolean {
    return this.currentItem()?.id === itemId;
  }

  private isOwnedMedia(itemId: string, media: ItemMedia): boolean {
    return (
      this.isCurrentRouteItem(itemId) &&
      media.inventory_item_id === itemId &&
      this.mediaList().some(
        (candidate) => candidate.id === media.id && candidate.inventory_item_id === itemId,
      )
    );
  }

  private resetRouteLocalState(): void {
    this.isAddingCost.set(false);
    this.isEditModalOpen.set(false);
    this.isLabelModalOpen.set(false);
    this.mediaList.set([]);
    this.isUploading.set(false);
    this.uploadError.set(null);
    this.previewModalUrl.set(null);
    this.costForm.reset({ type: 'repair', amount: 0, description: '' });
  }

  private meldeFehlerWennNichtSynchronisiert(title: string, error: Error): void {
    if (!this.syncStatus.istZentralGemeldet(error)) this.toast.error(title, error.message);
  }

  private beschreibeFehlgeschlageneBilder(anzahl: number): string {
    return anzahl === 1
      ? '1 Bild konnte nicht hochgeladen werden.'
      : `${anzahl} Bilder konnten nicht hochgeladen werden.`;
  }

  private alsError(ursache: unknown): Error {
    return ursache instanceof Error ? ursache : new Error('Die Aktion ist fehlgeschlagen.');
  }
}
