import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import {
  LucideAngularModule,
  ShoppingBag,
  X,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Truck,
  CheckCircle2,
} from 'lucide-angular';
import { StoreService } from '../../../../core/services/store.service';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';

@Component({
  selector: 'app-store-cart-drawer',
  imports: [ModalDialogDirective, RouterLink, CurrencyPipe, LucideAngularModule],
  templateUrl: './store-cart-drawer.component.html',
  styleUrl: './store-cart-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'storeService.closeCart()',
  },
})
export class StoreCartDrawerComponent {
  readonly storeService = inject(StoreService);

  readonly bagIcon = ShoppingBag;
  readonly closeIcon = X;
  readonly plusIcon = Plus;
  readonly minusIcon = Minus;
  readonly trashIcon = Trash2;
  readonly arrowIcon = ArrowRight;
  readonly shieldIcon = ShieldCheck;
  readonly truckIcon = Truck;
  readonly checkIcon = CheckCircle2;
}
