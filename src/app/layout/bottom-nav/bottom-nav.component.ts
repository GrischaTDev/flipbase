import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideAngularModule,
  LayoutDashboard,
  ShoppingBag,
  Boxes,
  Search,
  Menu,
} from 'lucide-angular';

@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.scss',
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
