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
  ],
  templateUrl: './beta-applications.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BetaApplicationsComponent implements OnInit {
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
  readonly selectedApplication = signal<BetaApplication | null>(null);
  readonly approvalError = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  applicantName(application: BetaApplication): string {
    return `${application.firstName} ${application.lastName}`.trim();
  }

  lifecycleStatus(application: BetaApplication): { label: string; tone: BadgeTone } {
    if (application.status === 'rejected' && application.rejectionEmailStatus === 'failed') {
      return { label: 'Ablehnung nicht zugestellt', tone: 'critical' };
    }
    if (application.status === 'rejected') return { label: 'Abgelehnt', tone: 'critical' };
    if (
      application.licenseStatus === 'expired' ||
      (application.betaEndsAt !== null && new Date(application.betaEndsAt).getTime() <= Date.now())
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

  async resendRejection(application: BetaApplication): Promise<void> {
    await this.runAction(application, () => this.service.resendRejection(application.id));
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
