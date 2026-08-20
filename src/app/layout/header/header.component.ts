import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  LucideDynamicIcon,
  LucideLayers as Layers,
  LucideGlobe as Globe,
  LucideLogOut as LogOut,
  LucideUser as UserIcon,
  LucidePlus as Plus,
  LucideMenu as Menu,
  LucideSun as Sun,
  LucideMoon as Moon,
  LucideBell as Bell,
  LucideCheckCheck as CheckCheck,
  LucideTrash2 as Trash2,
  LucideSparkles as Sparkles,
  LucideSmartphone as Smartphone,
  LucideWifiOff as WifiOff,
  LucideSettings as Settings,
} from '@lucide/angular';
import { AuthService } from '../../core/services/auth.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { WorkspaceMemberService } from '../../core/services/workspace-member.service';
import { WebhookService } from '../../core/services/webhook.service';
import { AppNotification } from '../../core/models/webhook.models';
import { ThemeService } from '../../core/services/theme.service';
import { PwaService } from '../../core/services/pwa.service';
import { Workspace } from '../../core/models/flipbase.models';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-header',
  imports: [RouterLink, TranslatePipe, LucideDynamicIcon, DatePipe, NgTemplateOutlet],
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeAllDropdowns()',
  },
})
export class HeaderComponent {
  readonly auth = inject(AuthService);
  readonly workspaceService = inject(WorkspaceService);
  readonly memberService = inject(WorkspaceMemberService);
  readonly webhookService = inject(WebhookService);
  readonly themeService = inject(ThemeService);
  readonly pwaService = inject(PwaService);
  private readonly translate = inject(TranslateService);

  readonly toggleSidebar = output<void>();
  readonly openCreateWorkspace = output<void>();

  readonly isWorkspaceDropdownOpen = signal<boolean>(false);
  readonly isUserDropdownOpen = signal<boolean>(false);
  readonly isNotificationDropdownOpen = signal<boolean>(false);

  readonly workspaceContainer = viewChild<ElementRef<HTMLElement>>('workspaceContainer');
  readonly notificationContainer = viewChild<ElementRef<HTMLElement>>('notificationContainer');
  readonly userContainer = viewChild<ElementRef<HTMLElement>>('userContainer');

  // Icons
  readonly LayersIcon = Layers;
  readonly GlobeIcon = Globe;
  readonly LogOutIcon = LogOut;
  readonly UserIcon = UserIcon;
  readonly PlusIcon = Plus;
  readonly MenuIcon = Menu;
  readonly SunIcon = Sun;
  readonly MoonIcon = Moon;
  readonly settingsIcon = Settings;
  readonly BellIcon = Bell;
  readonly CheckCheckIcon = CheckCheck;
  readonly TrashIcon = Trash2;
  readonly SparklesIcon = Sparkles;
  readonly SmartphoneIcon = Smartphone;
  readonly WifiOffIcon = WifiOff;

  currentLanguage = signal<string>('de');

  toggleWorkspaceDropdown(): void {
    this.isWorkspaceDropdownOpen.update((v) => !v);
    this.isUserDropdownOpen.set(false);
    this.isNotificationDropdownOpen.set(false);
  }

  toggleUserDropdown(): void {
    this.isUserDropdownOpen.update((v) => !v);
    this.isWorkspaceDropdownOpen.set(false);
    this.isNotificationDropdownOpen.set(false);
  }

  toggleNotificationDropdown(): void {
    this.isNotificationDropdownOpen.update((v) => !v);
    this.isWorkspaceDropdownOpen.set(false);
    this.isUserDropdownOpen.set(false);
  }

  selectWorkspace(ws: Workspace): void {
    this.workspaceService.setCurrentWorkspace(ws);
    this.isWorkspaceDropdownOpen.set(false);
  }

  switchLanguage(lang: string): void {
    this.currentLanguage.set(lang);
    this.translate.use(lang);
  }

  async onSignOut(): Promise<void> {
    await this.auth.signOut();
  }

  /**
   * Oeffnet eine Meldung: als gelesen vermerken und das Menue schliessen.
   *
   * Das Markieren laeuft ueber den Dienst, damit der Zaehler an der Glocke
   * mitzieht und der Zustand das naechste Laden ueberlebt. Die eigentliche
   * Navigation macht routerLink im Template.
   */
  oeffneBenachrichtigung(notif: AppNotification): void {
    this.webhookService.markAsRead(notif.id);
    this.isNotificationDropdownOpen.set(false);
  }

  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!target) return;

    const wsEl = this.workspaceContainer()?.nativeElement;
    if (this.isWorkspaceDropdownOpen() && wsEl && !wsEl.contains(target)) {
      this.isWorkspaceDropdownOpen.set(false);
    }

    const notifEl = this.notificationContainer()?.nativeElement;
    if (this.isNotificationDropdownOpen() && notifEl && !notifEl.contains(target)) {
      this.isNotificationDropdownOpen.set(false);
    }

    const userEl = this.userContainer()?.nativeElement;
    if (this.isUserDropdownOpen() && userEl && !userEl.contains(target)) {
      this.isUserDropdownOpen.set(false);
    }
  }

  closeAllDropdowns(): void {
    this.isWorkspaceDropdownOpen.set(false);
    this.isNotificationDropdownOpen.set(false);
    this.isUserDropdownOpen.set(false);
  }
}
