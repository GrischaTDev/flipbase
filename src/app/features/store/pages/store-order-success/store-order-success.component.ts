import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import {
  LucideAngularModule,
  CheckCircle2,
  Package,
  Truck,
  Building,
  ArrowRight,
  ShoppingBag,
} from 'lucide-angular';
import { StoreService } from '../../../../core/services/store.service';
import { StoreOrder } from '../../../../core/models/store.models';

@Component({
  selector: 'app-store-order-success',
  imports: [RouterLink, CurrencyPipe, LucideAngularModule],
  templateUrl: './store-order-success.component.html',
  styleUrl: './store-order-success.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreOrderSuccessComponent {
  private readonly route = inject(ActivatedRoute);
  readonly storeService = inject(StoreService);

  readonly checkIcon = CheckCircle2;
  readonly packageIcon = Package;
  readonly truckIcon = Truck;
  readonly bankIcon = Building;
  readonly arrowIcon = ArrowRight;
  readonly bagIcon = ShoppingBag;

  readonly order = computed<StoreOrder | null>(() => {
    const id = this.route.snapshot.paramMap.get('orderId');
    if (!id) return null;
    return this.storeService.orders().find((o) => o.id === id) || null;
  });
}
