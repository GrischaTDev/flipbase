import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
} from 'lucide-angular';
import { StoreService } from '../../../core/services/store.service';
import { StoreCartDrawerComponent } from '../components/store-cart-drawer/store-cart-drawer.component';

@Component({
  selector: 'app-store-layout',
  imports: [RouterOutlet, RouterLink, LucideAngularModule, StoreCartDrawerComponent],
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
}
