import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  LucideArchive,
  LucideArchiveRestore,
  LucidePencil,
  LucidePlus,
  LucideUsers,
} from '@lucide/angular';
import type { Supplier } from '../../core/models/flipbase.models';
import {
  SELLER_MASTER_DATA_TABLE_CONFIG,
  SellerMasterDataColumnId,
} from '../../core/config/master-data-table.config';
import {
  tableStateDiffersFromDefaults,
  TableSortState,
} from '../../core/models/table-preferences.models';
import { SuppliersService } from '../../core/services/suppliers.service';
import { TablePreferencesService } from '../../core/services/table-preferences.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TableActionButtonComponent } from '../../shared/components/table-action-button/table-action-button.component';
import { ToastService } from '../../shared/components/toast/toast.service';
import { PurchaseSellerDialogComponent } from './components/purchase-seller-dialog/purchase-seller-dialog.component';
import {
  filterSellers,
  formatSellerLocation,
  sellerTypeLabel,
  type SellerTypeFilter,
} from './utils/seller-presentation';

@Component({
  selector: 'app-sellers',
  imports: [
    BadgeComponent,
    ButtonComponent,
    TableActionButtonComponent,
    CustomSelectComponent,
    DataTableComponent,
    PageHeaderComponent,
    PurchaseSellerDialogComponent,
  ],
  templateUrl: './sellers.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellersComponent {
  private readonly workspace = inject(WorkspaceService);
  private readonly toast = inject(ToastService);

  readonly embedded = input(false);
  readonly readOnly = input(false);
  readonly canArchive = input(true);
  readonly tablePreferences = inject(TablePreferencesService);
  readonly suppliersService = inject(SuppliersService);
  readonly search = signal('');
  readonly sellerTableConfig = SELLER_MASTER_DATA_TABLE_CONFIG;
  readonly workspaceId = computed(() => this.workspace.currentWorkspace()?.id ?? '');
  readonly tableState = computed(() =>
    this.tablePreferences.getTablePreferences<SellerMasterDataColumnId, 'name'>(
      'master_sellers',
      this.workspaceId(),
    )(),
  );
  readonly visibleColumns = computed(() =>
    [...this.tableState().columns]
      .filter((column) => column.visible)
      .sort((a, b) => a.order - b.order),
  );
  readonly viewModified = computed(() =>
    tableStateDiffersFromDefaults(this.tableState(), this.sellerTableConfig),
  );
  readonly sellerDialog = viewChild(PurchaseSellerDialogComponent);

  readonly typeFilter = signal<SellerTypeFilter>('all');
  readonly typeFilterOptions: readonly SelectOption<SellerTypeFilter>[] = [
    { value: 'all', label: 'Alle' },
    { value: 'company', label: 'Unternehmen' },
    { value: 'private', label: 'Privatpersonen' },
  ];
  readonly dialogOpen = signal(false);
  readonly selectedSeller = signal<Supplier | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly filteredSellers = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('de-DE');
    const direction = this.tableState().sort.direction === 'desc' ? -1 : 1;
    const sources = this.suppliersService
      .suppliers()
      .filter((seller) => seller.workspace_id === this.workspaceId());

    return filterSellers(sources, this.typeFilter())
      .filter(
        (seller) =>
          !query ||
          [
            seller.name,
            seller.contact_person,
            seller.email,
            seller.phone,
            seller.city,
            seller.country,
            seller.country_code,
          ].some((value) => value?.toLocaleLowerCase('de-DE').includes(query)),
      )
      .sort(
        (a, b) =>
          direction *
          a.name.localeCompare(b.name, 'de-DE', {
            numeric: true,
            sensitivity: 'base',
          }),
      );
  });

  readonly usersIcon = LucideUsers;
  readonly plusIcon = LucidePlus;
  readonly pencilIcon = LucidePencil;
  readonly archiveIcon = LucideArchive;
  readonly restoreIcon = LucideArchiveRestore;
  readonly formatLocation = formatSellerLocation;
  readonly typeLabel = sellerTypeLabel;

  hasUnsavedChanges(): boolean {
    return this.sellerDialog()?.hasUnsavedChanges() ?? false;
  }

  isSaving(): boolean {
    return this.sellerDialog()?.isSaving() ?? false;
  }

  toggleColumn(id: SellerMasterDataColumnId): void {
    this.tablePreferences.toggleColumnVisibility('master_sellers', id, this.workspaceId());
  }

  reorderColumns(event: { previousIndex: number; currentIndex: number }): void {
    this.tablePreferences.reorderColumns(
      'master_sellers',
      event.previousIndex,
      event.currentIndex,
      this.workspaceId(),
    );
  }

  changeSort(sort: TableSortState<'name'>): void {
    this.tablePreferences.setSort('master_sellers', sort, this.workspaceId());
  }

  resetView(): void {
    this.tablePreferences.resetToDefaults('master_sellers', this.workspaceId());
  }

  openCreateDialog(): void {
    if (this.readOnly() || !this.workspaceId() || this.isSaving()) return;
    this.selectedSeller.set(null);
    this.dialogOpen.set(true);
  }

  openEditDialog(seller: Supplier): void {
    if (this.readOnly() || seller.workspace_id !== this.workspaceId() || this.isSaving()) return;
    this.selectedSeller.set(seller);
    this.dialogOpen.set(true);
  }

  openSellerFromRow(event: MouseEvent, seller: Supplier): void {
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, input, select, textarea')) return;
    if (window.getSelection()?.toString()) return;
    this.openEditDialog(seller);
  }

  openSellerFromKeyboard(event: KeyboardEvent, seller: Supplier): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, input, select, textarea')) return;
    event.preventDefault();
    this.openEditDialog(seller);
  }

  editSellerFromAction(event: MouseEvent, seller: Supplier): void {
    event.stopPropagation();
    this.openEditDialog(seller);
  }

  archiveSellerFromAction(event: MouseEvent, seller: Supplier): void {
    event.stopPropagation();
    void this.setArchived(seller, seller.is_active !== false);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
    this.selectedSeller.set(null);
  }

  handleSaved(): void {
    const wasEditing = this.selectedSeller() !== null;
    this.closeDialog();
    this.toast.success(wasEditing ? 'Verkäufer wurde gespeichert.' : 'Verkäufer wurde erstellt.');
  }

  async toggleArchivedVisibility(): Promise<void> {
    this.actionError.set(null);
    this.suppliersService.zeigeArchivierte.update((visible) => !visible);
    await this.suppliersService.neuLaden();
  }

  async setArchived(seller: Supplier, archived: boolean): Promise<void> {
    if (this.readOnly() || !this.canArchive() || seller.workspace_id !== this.workspaceId()) return;
    this.actionError.set(null);
    const { error } = await this.suppliersService.setSupplierArchiviert(seller.id, archived);
    if (error) {
      this.actionError.set(error.message);
      this.toast.error('Verkäufer konnte nicht geändert werden.', error.message);
      return;
    }

    this.toast.success(
      archived ? 'Verkäufer wurde archiviert.' : 'Verkäufer wurde wiederhergestellt.',
    );
  }
}
