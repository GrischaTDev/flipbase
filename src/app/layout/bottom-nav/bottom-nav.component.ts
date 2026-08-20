import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideDynamicIcon,
  LucideLayoutDashboard as LayoutDashboard,
  LucideShoppingBag as ShoppingBag,
  LucideBoxes as Boxes,
  LucideSearch as Search,
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
  readonly toggleMenu = output<void>();

  readonly DashboardIcon = LayoutDashboard;
  readonly PurchasesIcon = ShoppingBag;
  readonly InventoryIcon = Boxes;
  readonly ResearchIcon = Search;
  readonly MenuIcon = Menu;
}
