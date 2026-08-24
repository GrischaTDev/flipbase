import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideShoppingBag as ShoppingBag,
  LucidePlus as Plus,
  LucidePackage as Package,
  LucideLayers as Layers,
  LucideBoxes as Boxes,
  LucideArrowRight as ArrowRight,
  LucideExternalLink as ExternalLink,
  LucideZap as Zap,
  LucideWallet as Wallet,
  LucideMapPin as MapPin,
  LucideSparkles as Sparkles,
  LucideTrash2 as Trash2,
  LucideCamera as Camera,
  LucideRefreshCw as RefreshCw,
  LucideX as X,
  LucideCoins as Coins,
  LucideWifi as Wifi,
  LucideWifiOff as WifiOff,
  LucideTag as Tag,
  LucideGift as Gift,
  LucideStore as Store,
  LucideTruck as Truck,
} from '@lucide/angular';
import { PurchaseService } from '../../core/services/purchase.service';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { InboundTrackingService } from '../../core/services/inbound-tracking.service';
import { PurchaseCreateModalComponent } from './components/purchase-create-modal/purchase-create-modal.component';
import { PurchaseType } from '../../core/models/flipbase.models';
import { ToastService } from '../../shared/components/toast/toast.service';

@Component({
  selector: 'app-purchases',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    CurrencyPipe,
    DatePipe,
    TranslatePipe,
    LucideDynamicIcon,
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
  private readonly toast = inject(ToastService);

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

  readonly rapidForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    purchasePrice: new FormControl<number>(10, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.5)],
    }),
    estimatedResalePrice: new FormControl<number>(25, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    locationName: new FormControl(this.offlineSyncService.cashWallet().locationName, {
      nonNullable: true,
    }),
    condition: new FormControl('Gebraucht', { nonNullable: true }),
    notes: new FormControl(''),
  });

  readonly walletConfigForm = new FormGroup({
    startCash: new FormControl<number>(this.offlineSyncService.cashWallet().startCash, {
      nonNullable: true,
    }),
    locationName: new FormControl(this.offlineSyncService.cashWallet().locationName, {
      nonNullable: true,
    }),
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

    try {
      this.offlineSyncService.recordRapidPurchase({
        title: val.title.trim(),
        purchasePrice: val.purchasePrice,
        estimatedResalePrice: val.estimatedResalePrice,
        locationName: val.locationName.trim() || undefined,
        condition: val.condition,
        notes: val.notes?.trim() || undefined,
      });
    } catch (error: unknown) {
      this.toast.error(
        'Einkauf konnte nicht lokal vorgemerkt werden.',
        this.beschreibeFehler(error),
      );
      return;
    }

    // Reset for next rapid entry while keeping location
    this.rapidForm.patchValue({
      title: '',
      purchasePrice: 10,
      estimatedResalePrice: 22,
      notes: '',
    });
    this.toast.success('Einkauf wurde lokal vorgemerkt.');
  }

  onSaveWalletConfig(): void {
    const val = this.walletConfigForm.getRawValue();
    try {
      this.offlineSyncService.startCashSession(val.startCash, val.locationName);
    } catch (error: unknown) {
      this.toast.error(
        'Wallet-Konfiguration konnte nicht gespeichert werden.',
        this.beschreibeFehler(error),
      );
      return;
    }
    this.isEditingWallet.set(false);
    this.toast.success('Wallet-Konfiguration wurde gespeichert.');
  }

  async onSyncNow(): Promise<void> {
    try {
      await this.offlineSyncService.syncToCloud();
      this.toast.success('Offline-Daten wurden synchronisiert.');
    } catch (error: unknown) {
      this.toast.error(
        'Offline-Daten konnten nicht synchronisiert werden.',
        this.beschreibeFehler(error),
      );
    }
  }

  onDeletePending(id: string): void {
    try {
      this.offlineSyncService.deletePendingEntry(id);
      this.toast.success('Vorgemerkter Einkauf wurde entfernt.');
    } catch (error: unknown) {
      this.toast.error(
        'Vorgemerkter Einkauf konnte nicht entfernt werden.',
        this.beschreibeFehler(error),
      );
    }
  }

  private beschreibeFehler(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Bitte versuche es erneut. Wenn der Fehler bestehen bleibt, prüfe den lokalen Speicher.';
  }
}
