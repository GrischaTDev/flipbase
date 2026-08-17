import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import {
  LucideAngularModule,
  ShoppingBag,
  Store,
  ShieldCheck,
  Truck,
  RotateCcw,
  Search,
  ArrowLeft,
  Sparkles,
  Lock,
  CreditCard,
  CheckCircle2,
  BadgePercent,
  Heart,
} from 'lucide-angular';
import { StoreService } from '../../../core/services/store.service';
import { StoreCartDrawerComponent } from '../components/store-cart-drawer/store-cart-drawer.component';
import { CurrencyPipe } from '@angular/common';

@Component({
  selector: 'app-store-layout',
  imports: [RouterOutlet, RouterLink, CurrencyPipe, LucideAngularModule, StoreCartDrawerComponent],
  templateUrl: './store-layout.component.html',
  styleUrl: './store-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreLayoutComponent {
  readonly storeService = inject(StoreService);

  readonly bagIcon = ShoppingBag;
  readonly storeIcon = Store;
  readonly shieldIcon = ShieldCheck;
  readonly truckIcon = Truck;
  readonly returnIcon = RotateCcw;
  readonly searchIcon = Search;
  readonly backIcon = ArrowLeft;
  readonly sparklesIcon = Sparkles;
  readonly lockIcon = Lock;
  readonly creditCardIcon = CreditCard;
  readonly checkIcon = CheckCircle2;
  readonly percentIcon = BadgePercent;
  readonly heartIcon = Heart;

  readonly remainingForFreeShipping = computed(() => {
    const subtotal = this.storeService.cartSubtotal();
    const threshold = this.storeService.storeSettings().freeShippingThreshold;
    return Math.max(0, threshold - subtotal);
  });
}

