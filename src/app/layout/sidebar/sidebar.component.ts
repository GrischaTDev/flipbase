import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideDatabase as Database,
  LucideLayoutDashboard as LayoutDashboard,
  LucideShoppingBag as ShoppingBag,
  LucideBookOpen as BookOpen,
  LucideSearch as Search,
  LucideCalculator as Calculator,
  LucideTag as Tag,
  LucideTrendingUp as TrendingUp,
  LucideStore as Store,
  LucideBarChart3 as BarChart3,
  LucideReceipt as Receipt,
  LucideSettings as Settings,
  LucideX as X,
  LucideTruck as Truck,
  LucideSmartphone as Smartphone,
  LucideImage as ImageIcon,
  LucideShieldCheck as ShieldCheck,
  LucideUsers as Users,
  LucideBot as Bot,
  LucideLightbulb as Lightbulb,
  LucideChevronRight as ChevronRight,
  LucideArrowLeft as ArrowLeft,
} from '@lucide/angular';
import type { LucideIconInput } from '@lucide/angular';
import type { SubNavigationItem } from '../../core/config/platform-admin-navigation';
import {
  DASHBOARD_NAVIGATION,
  IDEAS_NAVIGATION,
  OPERATOR_NAVIGATION,
  SETTINGS_NAVIGATION,
  MASTER_DATA_NAVIGATION,
  WORKSPACE_NAVIGATION_GROUPS,
  isIdeasRoute,
  isNavigationChildActive,
  isNavigationItemActive,
} from '../../core/config/workspace-navigation';
import type {
  WorkspaceNavigationIcon,
  WorkspaceNavigationItem,
} from '../../core/config/workspace-navigation';
import { MarketplaceSettingsService } from '../../core/services/marketplace-settings.service';
import { PlatformOperatorService } from '../../core/services/platform-operator.service';
import { PwaService } from '../../core/services/pwa.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import {
  isVintedWorkspaceRoute,
  isVintedNavigationActive,
  VINTED_ACCOUNTS_NAVIGATION,
  VINTED_WORKSPACE_NAVIGATION_GROUPS,
} from '../../core/config/vinted-workspace-navigation';

const NAVIGATION_ICONS: Record<WorkspaceNavigationIcon, LucideIconInput> = {
  dashboard: LayoutDashboard,
  database: Database,
  shoppingBag: ShoppingBag,
  users: Users,
  bot: Bot,
  bookOpen: BookOpen,
  image: ImageIcon,
  tag: Tag,
  trendingUp: TrendingUp,
  receipt: Receipt,
  barChart: BarChart3,
  store: Store,
  search: Search,
  calculator: Calculator,
  truck: Truck,
  settings: Settings,
  shieldCheck: ShieldCheck,
};

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    TranslatePipe,
    LucideDynamicIcon,
    NgOptimizedImage,
    NgTemplateOutlet,
    BadgeComponent,
  ],
  templateUrl: './sidebar.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  private readonly router = inject(Router);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  private readonly operatorService = inject(PlatformOperatorService);
  private readonly marketplaceSettingsService = inject(MarketplaceSettingsService);

  readonly isOpen = input<boolean>(false);
  readonly closed = output<void>();
  readonly closeIcon = X;
  readonly smartphoneIcon = Smartphone;
  readonly ideasIcon = Lightbulb;
  readonly chevronIcon = ChevronRight;
  readonly backIcon = ArrowLeft;
  readonly vintedContext = computed(() => isVintedWorkspaceRoute(this.currentUrl()));
  readonly vintedAccountsItem = VINTED_ACCOUNTS_NAVIGATION;
  readonly vintedNavigationGroups = VINTED_WORKSPACE_NAVIGATION_GROUPS;
  readonly pwaService = inject(PwaService);

  // Der Punkt bleibt verborgen, solange die bestehende Operator-Prüfung kein Ja liefert.
  readonly isOperator = this.operatorService.operator;
  readonly dashboardItem = DASHBOARD_NAVIGATION;
  readonly navigationGroups = computed(() => {
    const isOperator = this.isOperator();
    const settings = this.marketplaceSettingsService.settings();

    return WORKSPACE_NAVIGATION_GROUPS.map((group) => {
      if (group.id !== 'marketplaces') {
        return group;
      }

      const activeItems = group.items.filter((item) => {
        if (item.path === '/marketplaces/vinted') {
          return settings.vinted && isOperator;
        }
        if (item.path === '/marketplaces/ebay') {
          return settings.ebay;
        }
        if (item.path === '/marketplaces/kleinanzeigen') {
          return settings.kleinanzeigen;
        }
        return true;
      });

      return {
        ...group,
        items: activeItems,
      };
    }).filter((group) => group.items.length > 0);
  });
  readonly ideasGroup = IDEAS_NAVIGATION;
  readonly masterDataItem = MASTER_DATA_NAVIGATION;
  readonly settingsItem = SETTINGS_NAVIGATION;
  readonly operatorItem = OPERATOR_NAVIGATION;
  readonly ideasExpanded = signal(isIdeasRoute(this.router.url));
  readonly ideasActive = computed(() => isIdeasRoute(this.currentUrl()));

  constructor() {
    void this.operatorService.isOperator();
    effect(() => {
      // Nur URL-Wechsel öffnen automatisch. Ein manuelles Zuklappen auf einer
      // Ideen-Seite darf sich nicht durch die nächste Darstellung zurücksetzen.
      if (isIdeasRoute(this.currentUrl())) this.ideasExpanded.set(true);
    });
  }

  toggleIdeas(): void {
    this.ideasExpanded.update((expanded) => !expanded);
  }

  isItemActive(item: WorkspaceNavigationItem): boolean {
    return isNavigationItemActive(item, this.currentUrl());
  }

  isChildActive(child: SubNavigationItem): boolean {
    return isNavigationChildActive(child, this.currentUrl());
  }

  isVintedItemActive(path: string): boolean {
    return isVintedNavigationActive(path, this.currentUrl());
  }

  iconFor(item: Pick<WorkspaceNavigationItem, 'icon'>): LucideIconInput {
    return NAVIGATION_ICONS[item.icon];
  }
}
