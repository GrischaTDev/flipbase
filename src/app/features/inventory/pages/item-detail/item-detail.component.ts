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

@Component({
  selector: 'app-item-detail',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    LucideAngularModule,
    InventoryLabelModalComponent,
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

  readonly allStatuses: { value: ItemStatus; label: string }[] = [
    { value: 'received', label: 'Eingetroffen (received)' },
    { value: 'needs_review', label: 'Zu prüfen (needs_review)' },
    { value: 'researched', label: 'Recherchiert (researched)' },
    { value: 'ready', label: 'Verkaufsbereit (ready)' },
    { value: 'listed', label: 'Gelistet (listed)' },
    { value: 'reserved', label: 'Reserviert (reserved)' },
    { value: 'sold', label: 'Verkauft (sold)' },
    { value: 'returned', label: 'Retourniert (returned)' },
    { value: 'defective', label: 'Defekt (defective)' },
    { value: 'archived', label: 'Archiviert (archived)' },
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

  getPublicUrl(path: string): string {
    return this.mediaService.getPublicUrl(path);
  }

  async onChangeStatus(newStatus: string): Promise<void> {
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
