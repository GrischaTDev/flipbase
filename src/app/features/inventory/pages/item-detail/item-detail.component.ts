import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  ArrowLeft,
  Boxes,
  Tag,
  Search,
  Sparkles,
  DollarSign,
  Trash2,
  Plus,
  Wrench,
  Clock,
  ExternalLink,
  History,
  CheckCircle2,
  Image as ImageIcon,
  Upload,
  Star,
  Eye,
  FileText,
  X,
  Store,
  Printer,
} from 'lucide-angular';
import { InventoryService } from '../../../../core/services/inventory.service';
import { MediaService } from '../../../../core/services/media.service';
import { InventoryLabelModalComponent } from '../../../../shared/components/inventory-label-modal/inventory-label-modal.component';
import { ItemMedia, ItemStatus } from '../../../../core/models/reflip.models';

import { CustomSelectComponent, SelectOption } from '../../../../shared/components/custom-select/custom-select.component';

@Component({
  selector: 'app-item-detail',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    TranslatePipe,
    LucideAngularModule,
    InventoryLabelModalComponent,
    CustomSelectComponent,
  ],
  templateUrl: './item-detail.component.html',
  styleUrl: './item-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemDetailComponent {
  readonly id = input.required<string>();

  readonly inventoryService = inject(InventoryService);
  readonly mediaService = inject(MediaService);
  private readonly router = inject(Router);

  readonly arrowLeftIcon = ArrowLeft;
  readonly boxesIcon = Boxes;
  readonly tagIcon = Tag;
  readonly searchIcon = Search;
  readonly sparklesIcon = Sparkles;
  readonly dollarIcon = DollarSign;
  readonly trashIcon = Trash2;
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
  readonly isLabelModalOpen = signal<boolean>(false);
  readonly mediaList = signal<ItemMedia[]>([]);
  readonly isUploading = signal<boolean>(false);
  readonly uploadError = signal<string | null>(null);
  readonly previewModalUrl = signal<string | null>(null);

  readonly costForm = new FormGroup({
    type: new FormControl('repair', { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl<number>(0, { nonNullable: true, validators: [Validators.required, Validators.min(0.01)] }),
    description: new FormControl(''),
  });

  readonly statusOptions: SelectOption<ItemStatus>[] = [
    { value: 'received', label: 'Auf Lager', badgeClass: 'bg-blue-400', colorClass: 'bg-blue-500/20 text-blue-300 border-blue-500/50 hover:bg-blue-500/30' },
    { value: 'ready', label: 'Bereit', badgeClass: 'bg-amber-400', colorClass: 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30' },
    { value: 'listed', label: 'Gelistet', badgeClass: 'bg-emerald-400', colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30' },
    { value: 'sold', label: 'Verkauft', badgeClass: 'bg-purple-400', colorClass: 'bg-purple-500/20 text-purple-300 border-purple-500/50 hover:bg-purple-500/30' },
    { value: 'reserved', label: 'Reserviert', badgeClass: 'bg-slate-400', colorClass: 'bg-slate-500/20 text-slate-200 border-slate-500/50 hover:bg-slate-500/30' },
    { value: 'defective', label: 'Defekt / Ersatzteil', badgeClass: 'bg-rose-400', colorClass: 'bg-rose-500/20 text-rose-300 border-rose-500/50 hover:bg-rose-500/30' },
    { value: 'returned', label: 'Retourniert', badgeClass: 'bg-slate-400', colorClass: 'bg-slate-500/20 text-slate-200 border-slate-500/50 hover:bg-slate-500/30' },
    { value: 'archived', label: 'Archiviert', badgeClass: 'bg-slate-400', colorClass: 'bg-slate-500/20 text-slate-200 border-slate-500/50 hover:bg-slate-500/30' },
  ];

  constructor() {
    effect(() => {
      const itemId = this.id();
      if (itemId) {
        this.inventoryService.getItemById(itemId);
        this.loadMedia(itemId);
      }
    });
  }

  async loadMedia(itemId: string): Promise<void> {
    const list = await this.mediaService.loadItemMedia(itemId);
    this.mediaList.set(list);
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const itemId = this.id();
    if (!itemId) return;

    this.isUploading.set(true);
    this.uploadError.set(null);

    const files = Array.from(input.files);
    const hasExistingMedia = this.mediaList().length > 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isPrimary = !hasExistingMedia && i === 0;
      const { data, error } = await this.mediaService.uploadItemMedia(itemId, file, isPrimary);
      if (error) {
        this.uploadError.set(error.message);
      } else if (data) {
        this.mediaList.update((prev) => [data, ...prev]);
      }
    }

    this.isUploading.set(false);
    input.value = '';
  }

  async onSetPrimary(media: ItemMedia): Promise<void> {
    const itemId = this.id();
    if (!itemId) return;

    await this.mediaService.setPrimary(itemId, media.id);
    this.mediaList.update((prev) =>
      prev.map((m) => ({ ...m, is_primary: m.id === media.id }))
    );
  }

  async onDeleteMedia(media: ItemMedia): Promise<void> {
    const itemId = this.id();
    if (!itemId) return;

    await this.mediaService.deleteMedia(itemId, media.id, media.storage_path);
    this.mediaList.update((prev) => prev.filter((m) => m.id !== media.id));
  }

  getMediaUrl(path: string): string {
    return this.mediaService.getMediaUrl(path);
  }

  async onChangeStatus(newStatus: string | null): Promise<void> {
    if (!newStatus) return;
    const item = this.inventoryService.selectedItem();
    if (!item) return;
    await this.inventoryService.updateItemStatus(item.id, newStatus as ItemStatus);
  }

  async onAddCost(): Promise<void> {
    const item = this.inventoryService.selectedItem();
    if (!item || this.costForm.invalid) return;

    const val = this.costForm.getRawValue();
    await this.inventoryService.addItemCost(item.id, val.type, val.amount, val.description || undefined);

    this.costForm.reset({ type: 'repair', amount: 0, description: '' });
    this.isAddingCost.set(false);
  }

  async onDeleteCost(costId: string): Promise<void> {
    const item = this.inventoryService.selectedItem();
    if (!item) return;
    await this.inventoryService.deleteItemCost(item.id, costId);
  }

  async onTogglePublicStore(isPublic: boolean): Promise<void> {
    const item = this.inventoryService.selectedItem();
    if (!item) return;
    await this.inventoryService.updateItem(item.id, {
      is_public_store: isPublic,
    });
  }

  async onDeleteItem(): Promise<void> {
    const item = this.inventoryService.selectedItem();
    if (!item) return;
    if (confirm(`Möchtest du "${item.title}" wirklich unwiderruflich löschen?`)) {
      await this.inventoryService.deleteItem(item.id);
      this.router.navigate(['/inventory']);
    }
  }
}
