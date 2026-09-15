import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
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
  LucideWifiOff as WifiOff,
  LucideSettings as Settings,
} from '@lucide/angular';
import { AuthService } from '../../core/services/auth.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { WorkspaceMemberService } from '../../core/services/workspace-member.service';
import { WebhookService } from '../../core/services/webhook.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { AppNotification } from '../../core/models/webhook.models';
import { ThemeService } from '../../core/services/theme.service';
import { PwaService } from '../../core/services/pwa.service';
import { Workspace, WorkspaceRole } from '../../core/models/flipbase.models';
import { DatePipe } from '@angular/common';
import { ToastService } from '../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { PlatformOperatorService } from '../../core/services/platform-operator.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';

export function visibleHeaderRole(
  role: WorkspaceRole | null,
  isPlatformOperator = false,
): 'admin' | null {
  return role === 'admin' || isPlatformOperator ? 'admin' : null;
}

@Component({
  selector: 'app-header',
  imports: [
    RouterLink,
    TranslatePipe,
    LucideDynamicIcon,
    DatePipe,
    NgTemplateOutlet,
    BadgeComponent,
  ],
  templateUrl: './header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeAllDropdowns()',
  },
})
export class HeaderComponent {
  readonly isSidebarOpen = input<boolean>(false);
  readonly auth = inject(AuthService);
  readonly workspaceService = inject(WorkspaceService);
  readonly memberService = inject(WorkspaceMemberService);
  readonly webhookService = inject(WebhookService);
  private readonly dialog = inject(ConfirmDialogService);
  readonly themeService = inject(ThemeService);
  readonly pwaService = inject(PwaService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly operatorService = inject(PlatformOperatorService);

  readonly toggleSidebar = output<void>();
  readonly openCreateWorkspace = output<void>();

  readonly isWorkspaceDropdownOpen = signal<boolean>(false);
  readonly isUserDropdownOpen = signal<boolean>(false);
  readonly isNotificationDropdownOpen = signal<boolean>(false);
  readonly isUpdatingNotifications = signal(false);

  readonly workspaceContainer = viewChild<ElementRef<HTMLElement>>('workspaceContainer');
  readonly notificationContainer = viewChild<ElementRef<HTMLElement>>('notificationContainer');
  readonly userContainer = viewChild<ElementRef<HTMLElement>>('userContainer');

  readonly headerAdminRole = computed(() =>
    visibleHeaderRole(this.memberService.currentUserRole(), this.operatorService.operator()),
  );

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
  readonly WifiOffIcon = WifiOff;

  currentLanguage = signal<string>('de');

  constructor() {
    // Der Header verwendet dieselbe Datenbankprüfung wie der Admin-Wächter.
    // So bleibt der Badge auch sichtbar, wenn der Nutzer keine Workspace-Adminrolle,
    // aber Plattformzugriff auf /admin besitzt.
    void this.operatorService.isOperator();
  }

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
   * Oeffnet eine Meldung.
   *
   * Mit Ziel uebernimmt routerLink im Template die Navigation. Ohne Ziel -
   * typischerweise eine Ankuendigung des Betreibers - erscheint ihr Text in
   * einem Dialog, statt dass ein Klick ins Leere geht.
   *
   * Das Markieren laeuft ueber den Dienst, damit der Zaehler an der Glocke
   * mitzieht und der Zustand das naechste Laden ueberlebt.
   */
  async oeffneBenachrichtigung(notif: AppNotification): Promise<void> {
    this.isUpdatingNotifications.set(true);
    try {
      const result = await this.webhookService.markAsRead(notif.id);
      if (result.error && !result.reportedBySyncStatus) {
        this.toast.error(
          'Benachrichtigung konnte nicht aktualisiert werden.',
          result.error.message,
        );
      }
    } catch (ursache: unknown) {
      const error = ursache instanceof Error ? ursache : new Error('Unbekannter Fehler');
      if (!this.syncStatus.istZentralGemeldet(error)) {
        this.toast.error('Benachrichtigung konnte nicht aktualisiert werden.', error.message);
      }
    } finally {
      this.isUpdatingNotifications.set(false);
      this.isNotificationDropdownOpen.set(false);
    }

    if (!notif.link) {
      await this.dialog.zeigeHinweis(notif.title, notif.details || notif.message);
    }
  }

  async onMarkAllNotificationsRead(): Promise<void> {
    this.isUpdatingNotifications.set(true);
    try {
      const result = await this.webhookService.markAllAsRead();
      if (result.error) {
        if (!result.reportedBySyncStatus) {
          this.toast.error(
            'Benachrichtigungen konnten nicht aktualisiert werden.',
            result.error.message,
          );
        }
        return;
      }
      this.toast.success('Alle Benachrichtigungen wurden als gelesen markiert.');
    } catch (ursache: unknown) {
      const error = ursache instanceof Error ? ursache : new Error('Unbekannter Fehler');
      if (!this.syncStatus.istZentralGemeldet(error)) {
        this.toast.error('Benachrichtigungen konnten nicht aktualisiert werden.', error.message);
      }
    } finally {
      this.isUpdatingNotifications.set(false);
    }
  }

  async onClearNotifications(): Promise<void> {
    this.isUpdatingNotifications.set(true);
    try {
      const result = await this.webhookService.clearNotifications();
      if (result.error) {
        if (!result.reportedBySyncStatus) {
          this.toast.error(
            'Benachrichtigungsverlauf konnte nicht gelöscht werden.',
            result.error.message,
          );
        }
        return;
      }
      this.toast.success('Benachrichtigungsverlauf wurde gelöscht.');
    } catch (ursache: unknown) {
      const error = ursache instanceof Error ? ursache : new Error('Unbekannter Fehler');
      if (!this.syncStatus.istZentralGemeldet(error)) {
        this.toast.error('Benachrichtigungsverlauf konnte nicht gelöscht werden.', error.message);
      }
    } finally {
      this.isUpdatingNotifications.set(false);
    }
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
