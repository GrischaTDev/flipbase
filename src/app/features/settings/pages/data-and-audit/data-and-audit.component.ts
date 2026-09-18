import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideDownload, LucideFileText, LucideFilter, LucideRefreshCw } from '@lucide/angular';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import {
  BusinessEntityType,
  BusinessEvent,
  BusinessEventFilter,
} from '../../../../core/models/business-event.models';
import { WorkspaceRole } from '../../../../core/models/flipbase.models';
import { AuditExportService } from '../../../../core/services/audit-export.service';
import {
  BusinessEventService,
  redactBusinessEventValue,
} from '../../../../core/services/business-event.service';
import { ExportService } from '../../../../core/services/export.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import { MockDataStoreService } from '../../../../core/services/mock-data-store.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { SalesService } from '../../../../core/services/sales.service';
import { WorkspaceMemberService } from '../../../../core/services/workspace-member.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

export interface AuditFilterValue {
  readonly from: string;
  readonly to: string;
  readonly actorId: string;
  readonly entityType: BusinessEntityType | '';
  readonly eventType: string;
  readonly pageSize: number;
}

const ENTITY_TYPES: readonly BusinessEntityType[] = [
  'purchase',
  'inventory_item',
  'sale',
  'return',
  'export',
  'workspace',
];
export function canExportAuditData(role: WorkspaceRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'accountant';
}

export function auditFiltersFromQueryParams(params: ParamMap): AuditFilterValue {
  const entity = params.get('entity') ?? '';
  const requestedPageSize = Number(params.get('pageSize') ?? 50);
  return {
    from: /^\d{4}-\d{2}-\d{2}$/u.test(params.get('from') ?? '') ? params.get('from')! : '',
    to: /^\d{4}-\d{2}-\d{2}$/u.test(params.get('to') ?? '') ? params.get('to')! : '',
    actorId: params.get('actor') ?? '',
    entityType: ENTITY_TYPES.includes(entity as BusinessEntityType)
      ? (entity as BusinessEntityType)
      : '',
    eventType: (params.get('event') ?? '').trim(),
    pageSize: Number.isFinite(requestedPageSize)
      ? Math.min(100, Math.max(10, Math.trunc(requestedPageSize)))
      : 50,
  };
}

export function toBusinessEventFilter(
  workspaceId: string,
  value: AuditFilterValue,
  cursor?: string,
): BusinessEventFilter {
  return {
    workspaceId,
    ...(value.entityType ? { entityType: value.entityType } : {}),
    ...(value.eventType ? { eventType: value.eventType } : {}),
    ...(value.actorId ? { actorId: value.actorId } : {}),
    ...(value.from ? { from: localDayBoundaryAsUtc(value.from, false) } : {}),
    ...(value.to ? { to: localDayBoundaryAsUtc(value.to, true) } : {}),
    ...(cursor ? { cursor } : {}),
    pageSize: value.pageSize,
  };
}

function localDayBoundaryAsUtc(value: string, endOfDay: boolean): string {
  const parts = value.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const localStart = new Date(year, month - 1, day);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    localStart.getFullYear() !== year ||
    localStart.getMonth() !== month - 1 ||
    localStart.getDate() !== day
  ) {
    throw new Error('Das Filterdatum ist ungültig.');
  }
  const timestamp = endOfDay
    ? new Date(year, month - 1, day + 1).getTime() - 1
    : localStart.getTime();
  return new Date(timestamp).toISOString();
}

@Component({
  selector: 'app-data-and-audit',
  imports: [
    ReactiveFormsModule,
    CustomSelectComponent,
    DataTableComponent,
    ButtonComponent,
    DatePipe,
  ],
  templateUrl: './data-and-audit.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class DataAndAuditComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workspaceService = inject(WorkspaceService);
  readonly memberService = inject(WorkspaceMemberService);
  private readonly eventService = inject(BusinessEventService);
  private readonly exportService = inject(AuditExportService);
  private readonly csvExportService = inject(ExportService);
  private readonly purchaseService = inject(PurchaseService);
  private readonly inventoryService = inject(InventoryService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly salesService = inject(SalesService);
  private readonly toast = inject(ToastService);

  readonly filterIcon = LucideFilter;
  readonly refreshIcon = LucideRefreshCw;
  readonly downloadIcon = LucideDownload;
  readonly fileIcon = LucideFileText;

  readonly filters = new FormGroup({
    from: new FormControl('', { nonNullable: true }),
    to: new FormControl('', { nonNullable: true }),
    actorId: new FormControl('', { nonNullable: true }),
    entityType: new FormControl<BusinessEntityType | ''>('', { nonNullable: true }),
    eventType: new FormControl('', { nonNullable: true }),
    pageSize: new FormControl(50, { nonNullable: true }),
  });
  readonly entityOptions: readonly SelectOption<BusinessEntityType | ''>[] = [
    { value: '', label: 'Alle Datensatzarten' },
    { value: 'purchase', label: 'Einkauf' },
    { value: 'inventory_item', label: 'Inventarartikel' },
    { value: 'sale', label: 'Verkauf' },
    { value: 'return', label: 'Retoure' },
    { value: 'export', label: 'Export' },
    { value: 'workspace', label: 'Workspace' },
  ];
  readonly pageSizeOptions: readonly SelectOption<number>[] = [
    { value: 25, label: '25 Einträge' },
    { value: 50, label: '50 Einträge' },
    { value: 100, label: '100 Einträge' },
  ];
  readonly actorOptions = computed<readonly SelectOption<string>[]>(() => [
    { value: '', label: 'Alle Benutzer' },
    ...this.memberService.members().map((member) => ({
      value: member.user_id,
      label: member.full_name || member.email || member.user_id,
    })),
  ]);

  readonly events = signal<readonly BusinessEvent[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly isLoadingMore = signal(false);
  readonly filtersExpanded = signal(false);
  readonly additionalExportsExpanded = signal(false);
  readonly error = signal<string | null>(null);
  readonly isExporting = signal(false);
  readonly exportProgress = signal(0);
  readonly isDemoMode = this.mockStore.isDemoMode;
  readonly isAuthorized = computed(
    () => !this.isDemoMode() && canExportAuditData(this.memberService.currentUserRole()),
  );
  private requestSequence = 0;
  private loadedWorkspaceId: string | null = null;
  private exportAbortController: AbortController | null = null;

  constructor() {
    this.filters.setValue(auditFiltersFromQueryParams(this.route.snapshot.queryParamMap));
    effect(() => {
      const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
      if (!workspaceId || workspaceId === this.loadedWorkspaceId) return;
      this.loadedWorkspaceId = workspaceId;
      this.events.set([]);
      this.nextCursor.set(null);
      void this.loadPage(true);
    });
  }

  async applyFilters(): Promise<void> {
    const value = this.filters.getRawValue();
    if (value.from && value.to && value.from > value.to) {
      this.error.set('Das Startdatum darf nicht nach dem Enddatum liegen.');
      return;
    }
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        from: value.from || null,
        to: value.to || null,
        actor: value.actorId || null,
        entity: value.entityType || null,
        event: value.eventType.trim() || null,
        pageSize: value.pageSize,
      },
      replaceUrl: true,
    });
    await this.loadPage(true);
  }

  async loadMore(): Promise<void> {
    if (!this.nextCursor() || this.isLoadingMore()) return;
    await this.loadPage(false);
  }

  async downloadArchive(): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId || !this.isAuthorized() || this.isExporting()) return;
    this.exportAbortController = new AbortController();
    this.isExporting.set(true);
    this.exportProgress.set(0);
    this.error.set(null);
    try {
      const archive = await this.exportService.createArchive({
        workspaceId,
        pageSize: 100,
        signal: this.exportAbortController.signal,
        onProgress: (progress) => this.exportProgress.set(progress),
      });
      if (this.workspaceService.currentWorkspace()?.id !== workspaceId) return;
      this.exportService.downloadArchive(archive);
      this.toast.success('Datenarchiv wurde erstellt.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.error.set(
        error instanceof Error ? error.message : 'Das Datenarchiv konnte nicht erstellt werden.',
      );
    } finally {
      this.isExporting.set(false);
      this.exportAbortController = null;
    }
  }

  cancelExport(): void {
    this.exportAbortController?.abort();
  }

  async openPrintView(): Promise<void> {
    await this.router.navigate(['/settings/data/print'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  downloadPurchasesCsv(): void {
    this.csvExportService.downloadFile(
      this.csvExportService.generatePurchasesCsv(this.purchaseService.purchases()),
      'flipbase-einkaeufe.csv',
      'text/csv;charset=utf-8;',
    );
  }

  downloadInventoryCsv(): void {
    this.csvExportService.downloadFile(
      this.csvExportService.generateInventoryCsv(this.inventoryService.items()),
      'flipbase-inventar.csv',
      'text/csv;charset=utf-8;',
    );
  }

  downloadSalesCsv(): void {
    this.csvExportService.downloadFile(
      this.csvExportService.generateSalesCsv(this.salesService.sales()),
      'flipbase-verkaeufe.csv',
      'text/csv;charset=utf-8;',
    );
  }

  actorLabel(actorId: string | null): string {
    if (!actorId) return 'System';
    const member = this.memberService.members().find((candidate) => candidate.user_id === actorId);
    return member?.full_name || member?.email || actorId;
  }

  entityLabel(type: BusinessEntityType): string {
    return this.entityOptions.find((option) => option.value === type)?.label ?? type;
  }

  formattedChanges(event: BusinessEvent): string {
    return JSON.stringify(redactBusinessEventValue(event.changes), null, 2);
  }

  private async loadPage(reset: boolean): Promise<void> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) return;
    if (this.isDemoMode()) {
      this.events.set([]);
      this.nextCursor.set(null);
      this.error.set(null);
      return;
    }
    if (!this.isAuthorized()) {
      this.events.set([]);
      this.nextCursor.set(null);
      this.error.set(
        'Für das globale Prüfprotokoll ist eine Inhaber-, Admin- oder Buchhaltungsrolle erforderlich.',
      );
      return;
    }
    const sequence = ++this.requestSequence;
    if (reset) this.isLoading.set(true);
    else this.isLoadingMore.set(true);
    this.error.set(null);
    try {
      const page = await this.eventService.listEvents(
        toBusinessEventFilter(
          workspaceId,
          this.filters.getRawValue(),
          reset ? undefined : (this.nextCursor() ?? undefined),
        ),
      );
      if (
        sequence !== this.requestSequence ||
        this.workspaceService.currentWorkspace()?.id !== workspaceId
      ) {
        return;
      }
      this.events.update((current) => (reset ? page.events : [...current, ...page.events]));
      this.nextCursor.set(page.nextCursor);
    } catch (error) {
      if (sequence !== this.requestSequence) return;
      this.error.set(
        error instanceof Error ? error.message : 'Das Prüfprotokoll konnte nicht geladen werden.',
      );
      if (reset) this.events.set([]);
    } finally {
      if (sequence === this.requestSequence) {
        this.isLoading.set(false);
        this.isLoadingMore.set(false);
      }
    }
  }
}
