import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import {
  LucideAngularModule,
  ArrowLeft,
  ShoppingBag,
  ShieldCheck,
  Truck,
  RotateCcw,
  CheckCircle2,
  Tag,
  Share2,
  Check,
} from 'lucide-angular';
import { StoreService } from '../../../../core/services/store.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import { InventoryItem } from '../../../../core/models/reflip.models';

@Component({
  selector: 'app-store-item-detail',
  imports: [RouterLink, CurrencyPipe, LucideAngularModule],
  templateUrl: './store-item-detail.component.html',
  styleUrl: './store-item-detail.component.scss',
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
        return { label: 'Neu & Originalverpackt', class: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
      case 'like_new':
        return { label: 'Wie neu (Keine Gebrauchsspuren)', class: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
      case 'very_good':
        return { label: 'Sehr gut (Minimale Spuren)', class: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' };
      case 'used':
        return { label: 'Geprüfter Gebrauchtzustand', class: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
      case 'heavily_used':
        return { label: 'Starke Gebrauchsspuren', class: 'bg-orange-500/15 text-orange-400 border-orange-500/30' };
      default:
        return { label: 'Funktionsgeprüft', class: 'bg-rf-subtle text-rf-text-muted border-rf-border' };
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
