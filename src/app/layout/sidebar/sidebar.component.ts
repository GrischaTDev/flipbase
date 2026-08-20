import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideIconInput,
  LucideLayoutDashboard as LayoutDashboard,
  LucideShoppingBag as ShoppingBag,
  LucideBoxes as Boxes,
  LucideSearch as Search,
  LucideCalculator as Calculator,
  LucideTag as Tag,
  LucideTrendingUp as TrendingUp,
  LucideStore as Store,
  LucideBarChart3 as BarChart3,
  LucideReceipt as Receipt,
  LucideSettings as Settings,
  LucideX as X,
  LucideSparkles as Sparkles,
  LucideTruck as Truck,
} from '@lucide/angular';

interface NavItem {
  path: string;
  labelKey: string;
  label: string;
  icon: LucideIconInput;
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, TranslatePipe, LucideDynamicIcon],
  templateUrl: './sidebar.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  readonly isOpen = input<boolean>(false);
  readonly close = output<void>();

  readonly closeIcon = X;
  readonly logoIcon = Sparkles;

  readonly navItems: NavItem[] = [
    { path: '/dashboard', labelKey: 'NAV.DASHBOARD', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/purchases', labelKey: 'NAV.PURCHASES', label: 'Einkäufe', icon: ShoppingBag },
    { path: '/inventory', labelKey: 'NAV.INVENTORY', label: 'Inventar', icon: Boxes },
    { path: '/shop', labelKey: 'NAV.STORE', label: 'Mein Online-Shop', icon: Store },
    { path: '/research', labelKey: 'NAV.RESEARCH', label: 'Research', icon: Search },
    {
      path: '/deal-calculator',
      labelKey: 'NAV.DEAL_CALCULATOR',
      label: 'Deal Calculator',
      icon: Calculator,
    },
    { path: '/listings', labelKey: 'NAV.LISTINGS', label: 'Listing Studio', icon: Tag },
    { path: '/sales', labelKey: 'NAV.SALES', label: 'Verkäufe', icon: TrendingUp },
    {
      path: '/fulfillment',
      labelKey: 'NAV.FULFILLMENT',
      label: 'Packtisch & Versand',
      icon: Truck,
    },
    { path: '/accounting', labelKey: 'NAV.ACCOUNTING', label: 'Steuern & DATEV', icon: Receipt },
    {
      path: '/sources',
      labelKey: 'NAV.SOURCES_SUPPLIERS',
      label: 'Quellen & Lieferanten',
      icon: Store,
    },
    { path: '/analytics', labelKey: 'NAV.ANALYTICS', label: 'Analytics', icon: BarChart3 },
    { path: '/settings', labelKey: 'NAV.SETTINGS', label: 'Einstellungen', icon: Settings },
  ];
}
