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
import { BetaApplication, DEFAULT_GRANTED_DAYS } from '../../models/beta-application.model';
import {
  BetaApplicationsColumnId,
  BetaApplicationsSortField,
} from '../../../../core/config/table-defaults.config';
import { TableSortState } from '../../../../core/models/table-preferences.models';
import { TablePreferencesService } from '../../../../core/services/table-preferences.service';
import { TableColumnMenuComponent } from '../../../../shared/components/table-column-menu/table-column-menu.component';

const MIN_GRANTED_DAYS = 1;
const MAX_GRANTED_DAYS = 3650;

@Component({
  selector: 'app-beta-applications',
  imports: [DatePipe, TableColumnMenuComponent],
  templateUrl: './beta-applications.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BetaApplicationsComponent implements OnInit {
  private readonly service = inject(BetaApplicationService);
  readonly tablePreferences = inject(TablePreferencesService);

  readonly applications = signal<readonly BetaApplication[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly grantedDays = signal(DEFAULT_GRANTED_DAYS);
  readonly searchQuery = signal('');
  readonly statusFilter = signal<'all' | BetaApplication['status']>('all');
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
  readonly filteredApplications = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase('de');
    const filtered = query
      ? this.applications().filter((application) =>
          [this.applicantName(application), application.email, this.statusLabel(application.status)]
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
            ? this.statusLabel(left.status).localeCompare(this.statusLabel(right.status), 'de')
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
  readonly decidingId = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  applicantName(application: BetaApplication): string {
    return `${application.firstName} ${application.lastName}`.trim();
  }

  statusLabel(status: BetaApplication['status']): string {
    return status === 'open' ? 'Offen' : status === 'accepted' ? 'Angenommen' : 'Abgelehnt';
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

  /**
   * Uebernimmt die Laufzeit nur, wenn sie brauchbar ist.
   *
   * Ein geleertes Feld, ein Wert unter eins oder ueber 3650 laesst den
   * zuletzt gueltigen Wert stehen, statt ihn stillschweigend auf 0 zu setzen.
   */
  onGrantedDaysChange(rawValue: string): void {
    const value = Number(rawValue);
    const isUsable =
      rawValue.trim() !== '' &&
      Number.isFinite(value) &&
      value >= MIN_GRANTED_DAYS &&
      value <= MAX_GRANTED_DAYS;

    if (isUsable) {
      this.grantedDays.set(Math.trunc(value));
    }
  }

  async accept(application: BetaApplication, note: string): Promise<void> {
    await this.decide(application, 'accepted', note);
  }

  async reject(application: BetaApplication, note: string): Promise<void> {
    await this.decide(application, 'rejected', note);
  }

  private async decide(
    application: BetaApplication,
    status: 'accepted' | 'rejected',
    note: string,
  ): Promise<void> {
    this.error.set(null);
    this.decidingId.set(application.id);
    try {
      await this.service.decide(
        application.id,
        status,
        status === 'accepted' ? this.grantedDays() : null,
        note.trim() || null,
      );
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.decidingId.set(null);
    }
  }
}
