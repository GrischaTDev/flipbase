import { BetaLifecycleClockService } from '../../services/beta-lifecycle-clock.service';
import { BetaDurationDialogComponent } from '../../components/beta-duration-dialog/beta-duration-dialog.component';
import { BetaApplicationService } from '../../services/beta-application.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  LucideChartNoAxesCombined as ChartNoAxesCombined,
  LucideUsers as Users,
  LucideRefreshCw as RefreshCw,
  LucideTrash2 as Trash2,
  LucideClock as Clock,
} from '@lucide/angular';
import { BadgeComponent, BadgeTone } from '../../../../shared/components/badge/badge.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { PlatformUser } from '../../models/platform-user.model';
import { PlatformUserService } from '../../services/platform-user.service';

interface StatusDisplay {
  readonly label: string;
  readonly tone: BadgeTone;
}

@Component({
  selector: 'app-platform-users',
  imports: [
    DatePipe,
    BetaDurationDialogComponent,
    BadgeComponent,
    DataTableComponent,
    PageHeaderComponent,
    TableActionButtonComponent,
  ],
  templateUrl: './platform-users.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformUsersComponent implements OnInit {
  private readonly beta = inject(BetaApplicationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly durationUser = signal<PlatformUser | null>(null);
  readonly processing = signal(false);
  private readonly clock = inject(BetaLifecycleClockService);
  private readonly service = inject(PlatformUserService);

  readonly adminIcon = Users;
  readonly usageIcon = ChartNoAxesCombined;
  readonly resendIcon = RefreshCw;
  readonly deleteIcon = Trash2;
  readonly durationIcon = Clock;
  readonly users = signal<readonly PlatformUser[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchQuery = signal('');
  readonly filteredUsers = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('de');
    if (!query) return this.users();
    return this.users().filter((user) =>
      [user.fullName, user.email, user.workspaceName ?? '', this.accessStatus(user).label]
        .join(' ')
        .toLocaleLowerCase('de')
        .includes(query),
    );
  });

  ngOnInit(): void {
    void this.load();
  }

  registrationStatus(user: PlatformUser): StatusDisplay {
    if (user.revokedAt) return { label: 'Freigabe zurückgezogen', tone: 'critical' };
    if (
      !user.registeredAt &&
      user.invitationExpiresAt &&
      new Date(user.invitationExpiresAt).getTime() <= this.clock.now()
    )
      return { label: 'Registrierungsfrist abgelaufen', tone: 'caution' };
    if (user.registeredAt) return { label: 'Registriert', tone: 'success' };
    if (user.invitationStatus === 'failed') {
      return { label: 'Einladung fehlgeschlagen', tone: 'critical' };
    }
    if (user.applicationStatus === 'accepted' && user.invitationStatus === 'sent') {
      return { label: 'Wartet auf Registrierung', tone: 'info' };
    }
    return { label: 'Konto vorhanden', tone: 'neutral' };
  }

  accessStatus(user: PlatformUser): StatusDisplay {
    if (user.betaEndedAt) return { label: 'Beta beendet', tone: 'neutral' };
    if (user.licenseStatus === 'suspended') return { label: 'Gesperrt', tone: 'critical' };
    if (
      user.licenseStatus === 'expired' ||
      (user.betaEndsAt !== null && new Date(user.betaEndsAt).getTime() <= this.clock.now())
    ) {
      return { label: 'Beta abgelaufen', tone: 'neutral' };
    }
    if (user.licenseStatus === 'active') return { label: 'Beta aktiv', tone: 'success' };
    if (user.licenseStatus === 'pending') return { label: 'Beta ausstehend', tone: 'caution' };
    return { label: 'Kein Beta-Zugang', tone: 'neutral' };
  }

  remainingBetaDays(user: PlatformUser): number | null {
    if (user.licenseStatus !== 'active' || !user.betaEndsAt) return null;
    const milliseconds = new Date(user.betaEndsAt).getTime() - this.clock.now();
    return Math.max(0, Math.ceil(milliseconds / 86_400_000));
  }

  closeDuration(): void {
    if (!this.processing()) this.durationUser.set(null);
  }
  async resend(user: PlatformUser): Promise<void> {
    if (!user.applicationId || this.processing()) return;
    this.processing.set(true);
    this.error.set(null);
    try {
      await this.beta.resendInvitation(user.applicationId);
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.processing.set(false);
    }
  }
  async withdraw(user: PlatformUser): Promise<void> {
    if (!user.applicationId || this.processing()) return;
    if (
      !(await this.confirmDialog.frage({
        titel: 'Freigabe zurückziehen und löschen?',
        text:
          'Der Link wird ungültig. Das noch nicht registrierte Konto und die Bewerbung werden gelöscht. ' +
          user.email +
          ' kann sich anschließend erneut bewerben.',
        bestaetigenText: 'Zurückziehen und löschen',
        abbrechenText: 'Abbrechen',
        gefahr: true,
      })) ||
      this.processing()
    )
      return;
    this.processing.set(true);
    this.error.set(null);
    try {
      await this.beta.withdraw(user.applicationId);
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.processing.set(false);
    }
  }
  async changeDuration(change: { action: 'extend' | 'end'; days: number }): Promise<void> {
    const user = this.durationUser();
    if (!user?.applicationId || this.processing()) return;
    if (
      change.action === 'end' &&
      !(await this.confirmDialog.frage({
        titel: 'Beta jetzt beenden?',
        text: 'Der Zugang zur Anwendung wird sofort beendet. Konto und Daten bleiben erhalten.',
        bestaetigenText: 'Beta beenden',
        abbrechenText: 'Abbrechen',
        gefahr: true,
      }))
    )
      return;
    if (this.processing()) return;
    this.processing.set(true);
    this.error.set(null);
    try {
      await this.beta.changeDuration(user.applicationId, change.action, change.days);
      this.durationUser.set(null);
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.processing.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.users.set(await this.service.list());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }
}
