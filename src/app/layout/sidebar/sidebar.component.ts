import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { isArticleRoute } from '../../core/config/article-navigation';
import {
  PLATFORM_ADMIN_NAVIGATION,
  SubNavigationItem,
} from '../../core/config/platform-admin-navigation';
import { TranslatePipe } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideIconInput,
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
  LucideSparkles as Sparkles,
  LucideTruck as Truck,
  LucideSmartphone as Smartphone,
  LucideImage as ImageIcon,
  LucideShieldCheck as ShieldCheck,
  LucideUsers as Users,
  LucideBot as Bot,
} from '@lucide/angular';
import { PlatformOperatorService } from '../../core/services/platform-operator.service';
import { PwaService } from '../../core/services/pwa.service';
import { VERSION } from '../../core/version';
import { NgOptimizedImage } from '@angular/common';

interface NavItem {
  path: string;
  labelKey: string;
  label: string;
  icon: LucideIconInput;
  /**
   * Kennzeichnet einen Bereich, der noch nicht fuer den Betrieb taugt.
   *
   * Sichtbar im Menue, damit beim Ausprobieren klar ist, welche Zahlen man
   * nicht glauben darf - ein Bereich, der aussieht wie fertig, ist im
   * Livebetrieb die unangenehmste Sorte Baustelle.
   */
  baustelle?: boolean;
  /**
   * Unterseiten, die wie im Shopify-Admin eingerueckt unter dem Punkt
   * aufklappen - aber nur, solange man sich in diesem Bereich befindet.
   */
  children?: readonly SubNavigationItem[];
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, TranslatePipe, LucideDynamicIcon, NgOptimizedImage],
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

  isItemActive(item: NavItem): boolean {
    if (item.path === '/catalog') return isArticleRoute(this.currentUrl());
    return this.isWithin(item.path);
  }

  isChildActive(child: SubNavigationItem): boolean {
    return this.isWithin(child.path);
  }

  private isWithin(path: string): boolean {
    const current = this.currentUrl().split(/[?#]/, 1)[0];
    return current === path || current.startsWith(path + '/');
  }
  readonly isOpen = input<boolean>(false);
  readonly closed = output<void>();

  readonly closeIcon = X;
  readonly logoIcon = Sparkles;
  readonly smartphoneIcon = Smartphone;

  /**
   * Der Knopf zum Installieren stand bisher in der Kopfzeile - und dort mit
   * `hidden sm:inline-flex`, war auf dem Handy also unsichtbar. Ausgerechnet
   * dort, wo man eine App installiert. In der Seitenleiste ist er auf jedem
   * Geraet erreichbar: am Rechner dauerhaft, auf dem Handy ueber das Menue.
   */
  readonly pwaService = inject(PwaService);

  private readonly operatorService = inject(PlatformOperatorService);

  /**
   * Der Punkt Administration erscheint nur fuer Betreiber der Plattform.
   *
   * Das ist Bedienbarkeit, keine Sicherheit: Die Befugnis liegt in den
   * RLS-Regeln. Bis die Antwort aus der Datenbank da ist, bleibt der Punkt
   * verborgen - der Fehlerfall ist "nicht anzeigen".
   */
  readonly isOperator = this.operatorService.operator;

  readonly operatorItem: NavItem = {
    path: '/admin',
    labelKey: 'NAV.PLATFORM_ADMIN',
    label: 'Administration',
    icon: ShieldCheck,
    children: PLATFORM_ADMIN_NAVIGATION,
  };

  constructor() {
    // Die Antwort kommt aus der Datenbank und setzt das Signal. Ohne diesen
    // Anstoss bliebe der Punkt fuer immer verborgen: Der Waechter fragt erst
    // beim Aufruf von /admin, und dorthin kaeme man ohne den Punkt nicht.
    void this.operatorService.isOperator();
  }

  /** Aus Git und package.json erzeugt, siehe scripts/version-generieren.mjs. */
  readonly version = VERSION;

  readonly navItems: NavItem[] = [
    { path: '/dashboard', labelKey: 'NAV.DASHBOARD', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/sales', labelKey: 'NAV.SALES', label: 'Verkäufe', icon: TrendingUp },
    { path: '/purchases', labelKey: 'NAV.PURCHASES', label: 'Einkäufe', icon: ShoppingBag },
    { path: '/catalog', labelKey: 'NAV.CATALOG', label: 'Artikel', icon: BookOpen },
    {
      path: '/shop',
      labelKey: 'NAV.STORE',
      label: 'Online-Shop',
      icon: Store,
      // Zahlungen, Impressum und Rechtstexte sind Platzhalter. Der Shop zieht
      // spaeter ohnehin auf eine eigene Domain um.
      baustelle: true,
    },
    { path: '/research', labelKey: 'NAV.RESEARCH', label: 'Research', icon: Search },
    { path: '/vinted-bot', labelKey: 'NAV.DEAL_MONITOR', label: 'Vinted Bot', icon: Bot },
    {
      path: '/deal-calculator',
      labelKey: 'NAV.DEAL_CALCULATOR',
      label: 'Deal Calculator',
      icon: Calculator,
    },
    { path: '/listings', labelKey: 'NAV.LISTINGS', label: 'Listing Studio', icon: Tag },
    {
      path: '/image-optimizer',
      labelKey: 'NAV.IMAGE_OPTIMIZER',
      label: 'Bildoptimierer',
      icon: ImageIcon,
    },
    {
      path: '/fulfillment',
      labelKey: 'NAV.FULFILLMENT',
      label: 'Packtisch & Versand',
      icon: Truck,
    },
    { path: '/accounting', labelKey: 'NAV.ACCOUNTING', label: 'Steuern & DATEV', icon: Receipt },
    {
      path: '/sellers',
      labelKey: 'NAV.SELLERS',
      label: 'Verkäufer',
      icon: Users,
    },
    { path: '/analytics', labelKey: 'NAV.ANALYTICS', label: 'Analytics', icon: BarChart3 },
    { path: '/settings', labelKey: 'NAV.SETTINGS', label: 'Einstellungen', icon: Settings },
  ];
}
