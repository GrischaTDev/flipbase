import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideDynamicIcon,
  LucideLayoutDashboard as LayoutDashboard,
  LucideShoppingBag as ShoppingBag,
  LucideBoxes as Boxes,
  LucideTrendingUp as TrendingUp,
  LucideMenu as Menu,
} from '@lucide/angular';

@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive, LucideDynamicIcon],
  templateUrl: './bottom-nav.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomNavComponent {
  readonly isMenuOpen = input<boolean>(false);
  readonly toggleMenu = output<void>();

  readonly DashboardIcon = LayoutDashboard;
  readonly PurchasesIcon = ShoppingBag;
  readonly InventoryIcon = Boxes;
  readonly SalesIcon = TrendingUp;
  readonly MenuIcon = Menu;
}
