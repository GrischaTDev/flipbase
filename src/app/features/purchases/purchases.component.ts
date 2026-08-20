import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
  Zap,
  Wallet,
  MapPin,
  Sparkles,
  CheckCircle2,
  Trash2,
  Camera,
  RefreshCw,
  X,
  Coins,
  Wifi,
  WifiOff,
  Tag,
  Gift,
  Store,
  Truck,
} from 'lucide-angular';
import { PurchaseService } from '../../core/services/purchase.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { InboundTrackingService } from '../../core/services/inbound-tracking.service';
import { PurchaseCreateModalComponent } from './components/purchase-create-modal/purchase-create-modal.component';
import { Purchase, PurchaseType } from '../../core/models/reflip.models';

@Component({
  selector: 'app-purchases',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    TranslatePipe,
    LucideAngularModule,
    PurchaseCreateModalComponent,
  ],
  templateUrl: './purchases.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchasesComponent {
  readonly purchaseService = inject(PurchaseService);
  readonly offlineSyncService = inject(OfflineSyncService);
  readonly trackingService = inject(InboundTrackingService);

  readonly bagIcon = ShoppingBag;
  readonly plusIcon = Plus;
  readonly packageIcon = Package;
  readonly layersIcon = Layers;
  readonly boxesIcon = Boxes;
  readonly arrowRightIcon = ArrowRight;
  readonly truckIcon = Truck;
  readonly linkIcon = ExternalLink;
  readonly zapIcon = Zap;
  readonly walletIcon = Wallet;
  readonly tagIcon = Tag;
  readonly giftIcon = Gift;
  readonly storeIcon = Store;
  readonly pinIcon = MapPin;
  readonly sparklesIcon = Sparkles;
  readonly checkIcon = CheckCircle2;
  readonly trashIcon = Trash2;
  readonly cameraIcon = Camera;
  readonly refreshIcon = RefreshCw;
  readonly closeIcon = X;
  readonly coinsIcon = Coins;
  readonly wifiIcon = Wifi;
  readonly wifiOffIcon = WifiOff;

  readonly isCreateModalOpen = signal<boolean>(false);
  readonly isFleaMarketModalOpen = signal<boolean>(false);
  readonly activeTab = signal<'all' | PurchaseType>('all');
  readonly rapidSuccessBanner = signal<string | null>(null);

  readonly rapidForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    purchasePrice: new FormControl<number>(10, { nonNullable: true, validators: [Validators.required, Validators.min(0.5)] }),
    estimatedResalePrice: new FormControl<number>(25, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    locationName: new FormControl(this.offlineSyncService.cashWallet().locationName, { nonNullable: true }),
    condition: new FormControl('Gebraucht', { nonNullable: true }),
    notes: new FormControl(''),
  });

  readonly walletConfigForm = new FormGroup({
    startCash: new FormControl<number>(this.offlineSyncService.cashWallet().startCash, { nonNullable: true }),
    locationName: new FormControl(this.offlineSyncService.cashWallet().locationName, { nonNullable: true }),
  });

  readonly isEditingWallet = signal<boolean>(false);

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

  openFleaMarketModal(): void {
    this.rapidForm.patchValue({
      locationName: this.offlineSyncService.cashWallet().locationName,
    });
    this.isFleaMarketModalOpen.set(true);
  }

  closeFleaMarketModal(): void {
    this.isFleaMarketModalOpen.set(false);
  }

  onPriceChange(price: number): void {
    const calculatedResale = Number((price * 2.2).toFixed(2));
    this.rapidForm.patchValue({
      purchasePrice: price,
      estimatedResalePrice: calculatedResale,
    });
  }

  onAddQuickAmount(add: number): void {
    const current = this.rapidForm.get('purchasePrice')?.value || 0;
    const newPrice = current + add;
    this.onPriceChange(newPrice);
  }

  onSubmitRapidPurchase(): void {
    if (this.rapidForm.invalid) return;
    const val = this.rapidForm.getRawValue();

    const created = this.offlineSyncService.recordRapidPurchase({
      title: val.title.trim(),
      purchasePrice: val.purchasePrice,
      estimatedResalePrice: val.estimatedResalePrice,
      locationName: val.locationName.trim() || undefined,
      condition: val.condition,
      notes: val.notes?.trim() || undefined,
    });

    this.rapidSuccessBanner.set(`"${created.title}" für ${created.purchase_price.toFixed(2)} € gespeichert!`);
    setTimeout(() => this.rapidSuccessBanner.set(null), 4000);

    // Reset for next rapid entry while keeping location
    this.rapidForm.patchValue({
      title: '',
      purchasePrice: 10,
      estimatedResalePrice: 22,
      notes: '',
    });
  }

  onSaveWalletConfig(): void {
    const val = this.walletConfigForm.getRawValue();
    this.offlineSyncService.startCashSession(val.startCash, val.locationName);
    this.isEditingWallet.set(false);
  }

  async onSyncNow(): Promise<void> {
    await this.offlineSyncService.syncToCloud();
  }

  onDeletePending(id: string): void {
    this.offlineSyncService.deletePendingEntry(id);
  }
}
