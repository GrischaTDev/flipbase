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
import { Router, RouterLink } from '@angular/router';
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
import { WebhookService } from '../../core/services/webhook.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { AppNotification } from '../../core/models/webhook.models';
import { ThemeService } from '../../core/services/theme.service';
import { PwaService } from '../../core/services/pwa.service';
import { Workspace } from '../../core/models/flipbase.models';
import { DatePipe } from '@angular/common';
import { ToastService } from '../../shared/components/toast/toast.service';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { PlatformOperatorService } from '../../core/services/platform-operator.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { MarketplaceFeedbackNotificationStore } from '../../features/marketplaces/services/marketplace-feedback-notification.store';
import { MarketplaceFavoriteNotificationStore } from '../../features/marketplaces/services/marketplace-favorite-notification.store';

export function visibleHeaderRole(isPlatformOperator: boolean): 'admin' | null {
  return isPlatformOperator ? 'admin' : null;
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
  readonly workspaceActionsBlocked = input<boolean>(false);
  readonly auth = inject(AuthService);
  readonly workspaceService = inject(WorkspaceService);
  readonly webhookService = inject(WebhookService);
  readonly favoriteNotifications = inject(MarketplaceFavoriteNotificationStore);
  readonly feedbackNotifications = inject(MarketplaceFeedbackNotificationStore);
  private readonly dialog = inject(ConfirmDialogService);
  readonly themeService = inject(ThemeService);
  readonly pwaService = inject(PwaService);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly operatorService = inject(PlatformOperatorService);
  private readonly router = inject(Router);

  readonly toggleSidebar = output<void>();
  readonly openCreateWorkspace = output<void>();

  readonly isWorkspaceDropdownOpen = signal<boolean>(false);
  readonly isUserDropdownOpen = signal<boolean>(false);
  readonly isNotificationDropdownOpen = signal<boolean>(false);
  readonly isUpdatingNotifications = signal(false);
  readonly notifications = computed(() =>
    [
      ...this.webhookService.notifications(),
      ...this.favoriteNotifications.notifications(),
      ...this.feedbackNotifications.notifications(),
    ]
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
      .slice(0, 50),
  );
  readonly notificationLinks = computed(
    () =>
      new Map(
        this.notifications().flatMap((notification) =>
          notification.link
            ? [[notification.id, this.router.parseUrl(notification.link)] as const]
            : [],
        ),
      ),
  );
  readonly unreadCount = computed(
    () =>
      this.webhookService.unreadCount() +
      this.favoriteNotifications.unreadCount() +
      this.feedbackNotifications.unreadCount(),
  );

  readonly workspaceContainer = viewChild<ElementRef<HTMLElement>>('workspaceContainer');
  readonly notificationContainer = viewChild<ElementRef<HTMLElement>>('notificationContainer');
  readonly userContainer = viewChild<ElementRef<HTMLElement>>('userContainer');

  readonly headerAdminRole = computed(() => visibleHeaderRole(this.operatorService.operator()));

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
    // Workspace-Rollen allein verleihen keinen Zugriff auf /admin und zeigen
    // deshalb auch keinen Plattform-Admin-Badge.
    void this.operatorService.isOperator();
  }

  toggleWorkspaceDropdown(): void {
    if (this.workspaceActionsBlocked()) return;
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
    if (this.isNotificationDropdownOpen()) {
      void this.favoriteNotifications.reload();
      void this.feedbackNotifications.reload();
    }
    this.isWorkspaceDropdownOpen.set(false);
    this.isUserDropdownOpen.set(false);
  }

  selectWorkspace(ws: Workspace): void {
    if (this.workspaceActionsBlocked()) return;
    if (this.workspaceService.switchWorkspace(ws.id)) this.isWorkspaceDropdownOpen.set(false);
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
      if (notif.id.startsWith('marketplace-feedback:')) {
        await this.feedbackNotifications.markAsRead(notif.id);
      } else if (notif.id.startsWith('marketplace:')) {
        await this.favoriteNotifications.markAsRead(notif.id);
      } else {
        const result = await this.webhookService.markAsRead(notif.id);
        if (result.error && !result.reportedBySyncStatus) {
          this.toast.error(
            'Benachrichtigung konnte nicht aktualisiert werden.',
            result.error.message,
          );
        }
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
      const result = await this.updateNotificationStreams('markAllAsRead');
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
      const result = await this.updateNotificationStreams('clearNotifications');
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

  private async updateNotificationStreams(operation: 'markAllAsRead' | 'clearNotifications') {
    // Alle Speicherungen abschließen; ein Teilerfolg ist keine gemeinsame Bestätigung.
    const [general, favorites, feedback] = await Promise.allSettled([
      this.webhookService[operation](),
      this.favoriteNotifications[operation](),
      this.feedbackNotifications[operation](),
    ]);
    if (feedback.status === 'rejected') throw feedback.reason;
    if (favorites.status === 'rejected') throw favorites.reason;
    if (general.status === 'rejected') throw general.reason;
    return general.value;
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
