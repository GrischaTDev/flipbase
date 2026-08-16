import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideAngularModule,
  LucideIconData,
  LayoutDashboard,
  ShoppingBag,
  Boxes,
  Search,
  Calculator,
  Tag,
  TrendingUp,
  Store,
  BarChart3,
  Settings,
  X,
  Sparkles,
} from 'lucide-angular';

interface NavItem {
  path: string;
  labelKey: string;
  icon: LucideIconData;
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, TranslatePipe, LucideAngularModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  readonly isOpen = input<boolean>(false);
  readonly close = output<void>();

  readonly closeIcon = X;
  readonly logoIcon = Sparkles;

  readonly navItems: NavItem[] = [
    { path: '/dashboard', labelKey: 'NAV.DASHBOARD', icon: LayoutDashboard },
    { path: '/purchases', labelKey: 'NAV.PURCHASES', icon: ShoppingBag },
    { path: '/inventory', labelKey: 'NAV.INVENTORY', icon: Boxes },
    { path: '/research', labelKey: 'NAV.RESEARCH', icon: Search },
    { path: '/deal-calculator', labelKey: 'NAV.DEAL_CALCULATOR', icon: Calculator },
    { path: '/listings', labelKey: 'NAV.LISTINGS', icon: Tag },
    { path: '/sales', labelKey: 'NAV.SALES', icon: TrendingUp },
    { path: '/sources', labelKey: 'NAV.SOURCES_SUPPLIERS', icon: Store },
    { path: '/analytics', labelKey: 'NAV.ANALYTICS', icon: BarChart3 },
    { path: '/settings', labelKey: 'NAV.SETTINGS', icon: Settings },
  ];
}
