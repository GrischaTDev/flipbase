import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  LucideArchive,
  LucideArchiveRestore,
  LucideDynamicIcon,
  LucidePencil,
  LucidePlus,
  LucideUsers,
} from '@lucide/angular';
import type { Supplier } from '../../core/models/flipbase.models';
import { SuppliersService } from '../../core/services/suppliers.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
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
    CustomSelectComponent,
    LucideDynamicIcon,
    PageHeaderComponent,
    PurchaseSellerDialogComponent,
  ],
  templateUrl: './sellers.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellersComponent {
  private readonly toast = inject(ToastService);

  readonly suppliersService = inject(SuppliersService);
  readonly typeFilter = signal<SellerTypeFilter>('all');
  readonly typeFilterOptions: readonly SelectOption<SellerTypeFilter>[] = [
    { value: 'all', label: 'Alle' },
    { value: 'company', label: 'Unternehmen' },
    { value: 'private', label: 'Privatpersonen' },
  ];
  readonly dialogOpen = signal(false);
  readonly selectedSeller = signal<Supplier | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly filteredSellers = computed(() =>
    filterSellers(this.suppliersService.suppliers(), this.typeFilter()),
  );

  readonly usersIcon = LucideUsers;
  readonly plusIcon = LucidePlus;
  readonly pencilIcon = LucidePencil;
  readonly archiveIcon = LucideArchive;
  readonly restoreIcon = LucideArchiveRestore;
  readonly formatLocation = formatSellerLocation;
  readonly typeLabel = sellerTypeLabel;

  openCreateDialog(): void {
    this.selectedSeller.set(null);
    this.dialogOpen.set(true);
  }

  openEditDialog(seller: Supplier): void {
    this.selectedSeller.set(seller);
    this.dialogOpen.set(true);
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
