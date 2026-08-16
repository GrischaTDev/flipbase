import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  ShoppingBag,
  Plus,
  Package,
  Layers,
  Boxes,
  ArrowRight,
  ExternalLink,
} from 'lucide-angular';
import { PurchaseService } from '../../core/services/purchase.service';
import { PurchaseCreateModalComponent } from './components/purchase-create-modal/purchase-create-modal.component';
import { PurchaseType } from '../../core/models/reflip.models';

@Component({
  selector: 'app-purchases',
  imports: [
    RouterLink,
    CurrencyPipe,
    DatePipe,
    TranslatePipe,
    LucideAngularModule,
    PurchaseCreateModalComponent,
  ],
  templateUrl: './purchases.component.html',
  styleUrl: './purchases.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchasesComponent {
  readonly purchaseService = inject(PurchaseService);

  readonly bagIcon = ShoppingBag;
  readonly plusIcon = Plus;
  readonly packageIcon = Package;
  readonly layersIcon = Layers;
  readonly boxesIcon = Boxes;
  readonly arrowRightIcon = ArrowRight;
  readonly linkIcon = ExternalLink;

  readonly isCreateModalOpen = signal<boolean>(false);
  readonly activeTab = signal<'all' | PurchaseType>('all');

  readonly filteredPurchases = computed(() => {
    const list = this.purchaseService.purchases();
    const tab = this.activeTab();
    if (tab === 'all') return list;
    return list.filter((p) => p.type === tab);
  });

  openCreateModal(): void {
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }
}
