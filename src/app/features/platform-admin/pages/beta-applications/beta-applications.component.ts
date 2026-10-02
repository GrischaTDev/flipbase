import { BetaLifecycleClockService } from '../../services/beta-lifecycle-clock.service';
import { BetaDurationDialogComponent } from '../../components/beta-duration-dialog/beta-duration-dialog.component';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { BetaApplicationService } from '../../services/beta-application.service';
import { BetaApplication } from '../../models/beta-application.model';
import {
  BetaApplicationsColumnId,
  BetaApplicationsSortField,
} from '../../../../core/config/table-defaults.config';
import {
  tableStateDiffersFromDefaults,
  TableSortState,
} from '../../../../core/models/table-preferences.models';
import { TablePreferencesService } from '../../../../core/services/table-preferences.service';
import { TableSortHeaderComponent } from '../../../../shared/components/table-sort-header/table-sort-header.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { BadgeComponent, BadgeTone } from '../../../../shared/components/badge/badge.component';
import {
  LucideShieldCheck as ShieldCheck,
  LucideRefreshCw as RefreshCw,
  LucideCheck as Check,
  LucideX as X,
  LucideTrash2 as Trash2,
  LucideClock as Clock,
} from '@lucide/angular';
import { BetaApprovalDialogComponent } from '../../components/beta-approval-dialog/beta-approval-dialog.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-beta-applications',
  imports: [
    DatePipe,
    TableSortHeaderComponent,
    PageHeaderComponent,
    DataTableComponent,
    ButtonComponent,
    TableActionButtonComponent,
    BadgeComponent,
    BetaApprovalDialogComponent,
    BetaDurationDialogComponent,
  ],
  templateUrl: './beta-applications.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BetaApplicationsComponent implements OnInit {
  private readonly clock = inject(BetaLifecycleClockService);
  private readonly service = inject(BetaApplicationService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly tablePreferences = inject(TablePreferencesService);

  readonly applications = signal<readonly BetaApplication[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchQuery = signal('');
  readonly statusFilter = signal<'all' | BetaApplication['status']>('all');
  readonly adminIcon = ShieldCheck;
  readonly resendIcon = RefreshCw;
  readonly approveIcon = Check;
  readonly rejectIcon = X;
  readonly deleteIcon = Trash2;
  readonly durationIcon = Clock;
  readonly betaStatusFilters = [
    { value: 'all' as const, label: 'Alle' },
    { value: 'open' as const, label: 'Offen' },
    { value: 'accepted' as const, label: 'Angenommen' },
    { value: 'rejected' as const, label: 'Abgelehnt' },
  ];
  readonly betaTableConfig = this.tablePreferences.getTableConfig<
    BetaApplicationsColumnId,
    BetaApplicationsSortField
  >('beta_applications');
  readonly tablePrefs = computed(() =>
    this.tablePreferences.getTablePreferences<BetaApplicationsColumnId, BetaApplicationsSortField>(
      'beta_applications',
      'default',
    )(),
  );
  readonly visibleColumns = computed(() =>
    this.tablePrefs()
      .columns.filter((column) => column.visible)
      .map((column) => column.id),
  );
  readonly orderedVisibleColumns = computed(() =>
    this.tablePrefs().columns.filter((column) => column.visible),
  );
  readonly viewModified = computed(
    () =>
      this.searchQuery().trim() !== '' ||
      this.statusFilter() !== 'all' ||
      tableStateDiffersFromDefaults(this.tablePrefs(), this.betaTableConfig),
  );
  readonly filteredApplications = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('de');
    const filtered = query
      ? this.applications().filter((application) =>
          [
            this.applicantName(application),
            application.email,
            this.lifecycleStatus(application).label,
          ]
            .join(' ')
            .toLocaleLowerCase('de')
            .includes(query),
        )
      : [...this.applications()];
    const status = this.statusFilter();
    const statusFiltered =
      status === 'all' ? filtered : filtered.filter((item) => item.status === status);
    const sort = this.tablePrefs().sort;
    return statusFiltered.sort((left, right) => {
      const comparison =
        sort.field === 'applicant'
          ? this.applicantName(left).localeCompare(this.applicantName(right), 'de', {
              sensitivity: 'base',
            })
          : sort.field === 'status'
            ? this.lifecycleStatus(left).label.localeCompare(
                this.lifecycleStatus(right).label,
                'de',
              )
            : left.createdAt.localeCompare(right.createdAt);
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  });

  /**
   * Kennung der Bewerbung, ueber die gerade entschieden wird.
   *
   * Haelt waehrend der laufenden Anfrage die Knoepfe genau dieser Zeile
   * gesperrt. Ohne das liesse sich per Doppelklick dieselbe Entscheidung
   * zweimal abschicken.
   */
  readonly processingId = signal<string | null>(null);
  readonly durationApplication = signal<BetaApplication | null>(null);
  readonly selectedApplication = signal<BetaApplication | null>(null);
  readonly approvalError = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  applicantName(application: BetaApplication): string {
    return `${application.firstName} ${application.lastName}`.trim();
  }

  lifecycleStatus(application: BetaApplication): { label: string; tone: BadgeTone } {
    if (application.revokedAt)
      return { label: 'Freigabe zurückgezogen – Löschen erneut versuchen', tone: 'critical' };
    if (
      !application.registeredAt &&
      application.invitationExpiresAt &&
      new Date(application.invitationExpiresAt).getTime() <= this.clock.now()
    )
      return { label: 'Registrierungsfrist abgelaufen', tone: 'caution' };
    if (application.betaEndedAt) return { label: 'Beta beendet', tone: 'neutral' };
    if (application.status === 'rejected' && application.rejectionEmailStatus === 'failed') {
      return { label: 'Ablehnung nicht zugestellt', tone: 'critical' };
    }
    if (application.status === 'rejected') return { label: 'Abgelehnt', tone: 'critical' };
    if (
      application.licenseStatus === 'expired' ||
      (application.betaEndsAt !== null &&
        new Date(application.betaEndsAt).getTime() <= this.clock.now())
    ) {
      return { label: 'Beta abgelaufen', tone: 'neutral' };
    }
    if (application.licenseStatus === 'suspended') {
      return { label: 'Beta gesperrt', tone: 'critical' };
    }
    if (application.licenseStatus === 'active') {
      return { label: 'Beta aktiv', tone: 'success' };
    }
    if (application.registeredAt) {
      return { label: 'Beta-Aktivierung ausstehend', tone: 'caution' };
    }
    if (application.invitationStatus === 'failed') {
      return { label: 'Einladung fehlgeschlagen', tone: 'critical' };
    }
    if (application.invitationStatus === 'sending') {
      return { label: 'Einladung wird gesendet', tone: 'caution' };
    }
    if (application.invitationStatus === 'sent') {
      return { label: 'Wartet auf Registrierung', tone: 'info' };
    }
    if (application.receiptEmailStatus === 'failed') {
      return { label: 'Bestätigung fehlgeschlagen', tone: 'critical' };
    }
    if (application.status === 'accepted') return { label: 'Angenommen', tone: 'success' };
    return { label: 'Offen', tone: 'caution' };
  }

  toggleColumnVisibility(columnId: BetaApplicationsColumnId): void {
    this.tablePreferences.toggleColumnVisibility('beta_applications', columnId, 'default');
  }

  onColumnsReordered(event: { previousIndex: number; currentIndex: number }): void {
    this.tablePreferences.reorderColumns(
      'beta_applications',
      event.previousIndex,
      event.currentIndex,
      'default',
    );
  }

  onSortChanged(sort: TableSortState<BetaApplicationsSortField>): void {
    this.tablePreferences.setSort('beta_applications', sort, 'default');
  }

  resetTablePreferences(): void {
    this.tablePreferences.resetToDefaults('beta_applications', 'default');
  }

  resetView(): void {
    this.searchQuery.set('');
    this.statusFilter.set('all');
    this.resetTablePreferences();
  }

  ariaSort(field: string): 'ascending' | 'descending' | null {
    const sort = this.tablePrefs().sort;
    if (sort.field !== field) return null;
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.applications.set(await this.service.list());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  openApproval(application: BetaApplication): void {
    this.approvalError.set(null);
    this.selectedApplication.set(application);
  }

  closeApproval(): void {
    if (!this.processingId()) this.selectedApplication.set(null);
  }

  async approveSelected(grantedDays: number): Promise<void> {
    const application = this.selectedApplication();
    if (!application) return;
    this.approvalError.set(null);
    const updated = await this.runAction(application, () =>
      application.status === 'accepted' && application.invitationStatus === 'failed'
        ? this.service.resendInvitation(application.id)
        : this.service.accept(application.id, grantedDays),
    );
    if (updated) this.selectedApplication.set(null);
    else await this.refreshFailedApproval(application.id);
  }

  async reject(application: BetaApplication): Promise<void> {
    const updated = await this.runAction(application, () => this.service.reject(application.id));
    if (!updated) await this.refreshApplicationsKeepingError();
  }

  async resendInvitation(application: BetaApplication): Promise<void> {
    await this.runAction(application, () => this.service.resendInvitation(application.id));
  }

  async resendApplicationReceipt(application: BetaApplication): Promise<void> {
    await this.runAction(application, () => this.service.resendApplicationReceipt(application.id));
  }

  async resendOperatorNotice(application: BetaApplication): Promise<void> {
    await this.runAction(application, () => this.service.resendOperatorNotice(application.id));
  }

  async resendRejection(application: BetaApplication): Promise<void> {
    await this.runAction(application, () => this.service.resendRejection(application.id));
  }

  async withdraw(application: BetaApplication): Promise<void> {
    if (this.processingId()) return;
    const confirmed = await this.confirmDialog.frage({
      titel: 'Freigabe zurückziehen und löschen?',
      text:
        'Die Einladung von ' +
        application.email +
        ' wird ungültig. Das noch nicht registrierte Konto und die Bewerbung werden gelöscht. Danach ist eine neue Bewerbung mit dieser E-Mail möglich.',
      bestaetigenText: 'Zurückziehen und löschen',
      abbrechenText: 'Abbrechen',
      gefahr: true,
    });
    if (!confirmed || this.processingId()) return;
    this.processingId.set(application.id);
    this.error.set(null);
    try {
      await this.service.withdraw(application.id);
      this.applications.update((rows) => rows.filter((row) => row.id !== application.id));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.processingId.set(null);
    }
  }

  closeDuration(): void {
    if (!this.processingId()) this.durationApplication.set(null);
  }
  async changeDuration(change: { action: 'extend' | 'end'; days: number }): Promise<void> {
    const application = this.durationApplication();
    if (!application || this.processingId()) return;
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
    if (this.processingId()) return;
    this.processingId.set(application.id);
    this.error.set(null);
    try {
      await this.service.changeDuration(application.id, change.action, change.days);
      this.durationApplication.set(null);
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.processingId.set(null);
    }
  }

  async deleteRejected(application: BetaApplication): Promise<void> {
    const confirmed = await this.confirmDialog.frage({
      titel: 'Abgelehnte Bewerbung löschen?',
      text: `Die Bewerbung von ${this.applicantName(application)} (${application.email}) wird dauerhaft gelöscht. Danach kann sich diese E-Mail-Adresse erneut für die Beta bewerben.`,
      bestaetigenText: 'Löschen',
      abbrechenText: 'Abbrechen',
      gefahr: true,
    });
    if (!confirmed) return;

    this.error.set(null);
    this.processingId.set(application.id);
    try {
      await this.service.deleteRejected(application.id);
      this.applications.update((applications) =>
        applications.filter((current) => current.id !== application.id),
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.processingId.set(null);
    }
  }

  private async runAction(
    application: BetaApplication,
    action: () => Promise<BetaApplication>,
  ): Promise<BetaApplication | null> {
    if (this.processingId()) return null;
    this.error.set(null);
    this.processingId.set(application.id);
    try {
      const updated = await action();
      this.applications.update((applications) =>
        applications.map((current) => (current.id === updated.id ? updated : current)),
      );
      return updated;
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      this.processingId.set(null);
    }
  }

  private async refreshFailedApproval(applicationId: string): Promise<void> {
    const message = this.error() ?? 'Die Einladung konnte nicht versendet werden.';
    try {
      const applications = await this.service.list();
      this.applications.set(applications);
      this.selectedApplication.set(
        applications.find((application) => application.id === applicationId) ?? null,
      );
    } catch {
      // Die ursprüngliche Versandmeldung bleibt maßgeblich. Der nächste reguläre
      // Ladevorgang gleicht den gespeicherten Zustand erneut ab.
    }
    this.approvalError.set(message);
  }

  private async refreshApplicationsKeepingError(): Promise<void> {
    const message = this.error();
    try {
      this.applications.set(await this.service.list());
    } catch {
      // Der Versandfehler ist fuer die Entscheidung hilfreicher als ein
      // nachgelagerter Ladefehler. Beim naechsten Laden wird erneut abgeglichen.
    }
    this.error.set(message);
  }
}
