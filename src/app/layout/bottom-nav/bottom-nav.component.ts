import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { isArticleRoute } from '../../core/config/article-navigation';
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
  private readonly router = inject(Router);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  isArticlesActive(): boolean {
    return isArticleRoute(this.currentUrl());
  }
  readonly isMenuOpen = input<boolean>(false);
  readonly toggleMenu = output<void>();

  readonly DashboardIcon = LayoutDashboard;
  readonly PurchasesIcon = ShoppingBag;
  readonly InventoryIcon = Boxes;
  readonly SalesIcon = TrendingUp;
  readonly MenuIcon = Menu;
}
