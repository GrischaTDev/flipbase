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
} from 'lucide-angular';
import { InventoryService } from '../../../../core/services/inventory.service';
import { ItemStatus } from '../../../../core/models/reflip.models';

@Component({
  selector: 'app-item-detail',
  imports: [RouterLink, ReactiveFormsModule, CurrencyPipe, DatePipe, LucideAngularModule],
  templateUrl: './item-detail.component.html',
  styleUrl: './item-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemDetailComponent {
  readonly id = input.required<string>();

  readonly inventoryService = inject(InventoryService);
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

  readonly isAddingCost = signal<boolean>(false);

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
      }
    });
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
    await this.inventoryService.deleteItemCost(costId, item.id);
  }

  async onDeleteItem(): Promise<void> {
    const item = this.inventoryService.selectedItem();
    if (!item) return;
    if (confirm(`Möchtest du "${item.title}" wirklich löschen?`)) {
      await this.inventoryService.deleteItem(item.id);
      this.router.navigate(['/inventory']);
    }
  }
}
