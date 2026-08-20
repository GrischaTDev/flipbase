import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import {
  LucideDynamicIcon,
  LucideArrowLeft as ArrowLeft,
  LucideShoppingBag as ShoppingBag,
  LucideShieldCheck as ShieldCheck,
  LucideTruck as Truck,
  LucideRotateCcw as RotateCcw,
  LucideCheckCircle2 as CheckCircle2,
  LucideTag as Tag,
  LucideShare2 as Share2,
  LucideCheck as Check,
} from '@lucide/angular';
import { StoreService } from '../../../../core/services/store.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import { InventoryItem } from '../../../../core/models/flipbase.models';

@Component({
  selector: 'app-store-item-detail',
  imports: [RouterLink, CurrencyPipe, LucideDynamicIcon],
  templateUrl: './store-item-detail.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreItemDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly storeService = inject(StoreService);
  private readonly inventoryService = inject(InventoryService);

  readonly backIcon = ArrowLeft;
  readonly bagIcon = ShoppingBag;
  readonly shieldIcon = ShieldCheck;
  readonly truckIcon = Truck;
  readonly returnIcon = RotateCcw;
  readonly checkIcon = CheckCircle2;
  readonly tagIcon = Tag;
  readonly shareIcon = Share2;
  readonly copiedIcon = Check;

  readonly activeImageIndex = signal<number>(0);
  readonly linkCopied = signal<boolean>(false);

  readonly item = computed<InventoryItem | null>(() => {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return null;
    return this.inventoryService.items().find((i) => i.id === id) || null;
  });

  getConditionBadge(condition?: string): { label: string; class: string } {
    switch (condition) {
      case 'new':
        return {
          label: 'Neu & Originalverpackt',
          class: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      case 'like_new':
        return {
          label: 'Wie neu (Keine Gebrauchsspuren)',
          class: 'bg-blue-50 text-blue-700 border-blue-200',
        };
      case 'very_good':
        return {
          label: 'Sehr gut (Minimale Spuren)',
          class: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        };
      case 'used':
        return {
          label: 'Geprüfter Gebrauchtzustand',
          class: 'bg-amber-50 text-amber-700 border-amber-200',
        };
      case 'heavily_used':
        return {
          label: 'Starke Gebrauchsspuren',
          class: 'bg-orange-50 text-orange-700 border-orange-200',
        };
      default:
        return { label: 'Funktionsgeprüft', class: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  }

  getItemPrice(item: InventoryItem): number {
    return item.expected_value ?? item.allocated_purchase_cost * 1.5;
  }

  onAddToCart(item: InventoryItem): void {
    this.storeService.addToCart(item);
  }

  onBuyNow(item: InventoryItem): void {
    this.storeService.addToCart(item);
    this.router.navigate(['/shop/checkout']);
  }

  onShareProduct(): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2500);
    }
  }
}
