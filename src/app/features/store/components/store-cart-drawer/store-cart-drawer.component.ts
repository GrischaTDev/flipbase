import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import {
  LucideDynamicIcon,
  LucideShoppingBag as ShoppingBag,
  LucideX as X,
  LucidePlus as Plus,
  LucideMinus as Minus,
  LucideTrash2 as Trash2,
  LucideArrowRight as ArrowRight,
  LucideShieldCheck as ShieldCheck,
  LucideTruck as Truck,
  LucideCheckCircle2 as CheckCircle2,
} from '@lucide/angular';
import { StoreService } from '../../../../core/services/store.service';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';

@Component({
  selector: 'app-store-cart-drawer',
  imports: [ModalDialogDirective, RouterLink, CurrencyPipe, LucideDynamicIcon],
  templateUrl: './store-cart-drawer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
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
