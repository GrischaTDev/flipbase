import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  LucideArchive,
  LucideArchiveRestore,
  LucideDatabase,
  LucideMerge,
  LucidePencil,
  LucidePlus,
} from '@lucide/angular';
import {
  MASTER_DATA_TABLE_CONFIGS,
  MasterDataColumnId,
  MasterDataTableId,
} from '../../core/config/master-data-table.config';
import { SALE_PLATFORM_OPTIONS } from '../../core/config/sale-platform-options';
import type { Source } from '../../core/models/flipbase.models';
import {
  tableStateDiffersFromDefaults,
  TableSortState,
} from '../../core/models/table-preferences.models';
import { BrandService } from '../../core/services/brand.service';
import { SourcesService } from '../../core/services/sources.service';
import { TablePreferencesService } from '../../core/services/table-preferences.service';
import { WorkspaceContextLockService } from '../../core/services/workspace-context-lock.service';
import { WorkspaceMemberService } from '../../core/services/workspace-member.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { ModalShellComponent } from '../../shared/components/modal-shell/modal-shell.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { RouteTabsComponent } from '../../shared/components/route-tabs/route-tabs.component';
import { TableActionButtonComponent } from '../../shared/components/table-action-button/table-action-button.component';
import { TextFieldComponent } from '../../shared/components/text-field/text-field.component';
import { ToastService } from '../../shared/components/toast/toast.service';
import { SellersComponent } from '../sellers/sellers.component';
import {
  MASTER_DATA_SECTIONS,
  MasterDataRow,
  MasterDataStatus,
  canEditMasterData,
  canManageMasterData,
  resolveMasterDataSection,
  selectMasterDataRows,
  validMergeTarget,
  validateMasterDataName,
} from './master-data-view';

type DialogMode = 'create' | 'edit' | 'merge' | 'archive';

@Component({
  selector: 'app-master-data',
  imports: [
    ReactiveFormsModule,
    BadgeComponent,
    ButtonComponent,
    CustomSelectComponent,
    DataTableComponent,
    ModalShellComponent,
    PageHeaderComponent,
    RouteTabsComponent,
    TableActionButtonComponent,
    TextFieldComponent,
    SellersComponent,
  ],
  templateUrl: './master-data.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class MasterDataComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly workspace = inject(WorkspaceService);
  private readonly members = inject(WorkspaceMemberService);
  private readonly context = inject(WorkspaceContextLockService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly preferences = inject(TablePreferencesService);
  private readonly toast = inject(ToastService);
  private readonly brands = inject(BrandService);
  private readonly sources = inject(SourcesService);

  readonly section = resolveMasterDataSection(this.route.snapshot.data['masterDataSection']);
  readonly tabs = MASTER_DATA_SECTIONS;
  readonly currentSection = MASTER_DATA_SECTIONS.find((section) => section.id === this.section)!;
  readonly sellers = viewChild(SellersComponent);
  readonly workspaceId = computed(() => this.workspace.currentWorkspace()?.id ?? '');
  readonly canEdit = computed(() =>
    canEditMasterData(this.members.currentUserRole(), this.members.isCurrentWorkspaceLoaded()),
  );
  readonly canManage = computed(() =>
    canManageMasterData(this.members.currentUserRole(), this.members.isCurrentWorkspaceLoaded()),
  );

  readonly plusIcon = LucidePlus;
  readonly databaseIcon = LucideDatabase;
  readonly editIcon = LucidePencil;
  readonly mergeIcon = LucideMerge;
  readonly archiveIcon = LucideArchive;
  readonly restoreIcon = LucideArchiveRestore;

  readonly search = signal('');
  readonly status = signal<MasterDataStatus>('active');
  readonly statusOptions: readonly SelectOption<MasterDataStatus>[] = [
    { value: 'active', label: 'Aktive Quellen' },
    { value: 'archived', label: 'Archivierte Quellen' },
    { value: 'all', label: 'Alle Quellen' },
  ];
  readonly managedSources = signal<readonly Source[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly dialogMode = signal<DialogMode | null>(null);
  readonly selectedRow = signal<MasterDataRow | null>(null);
  readonly dialogError = signal<string | null>(null);
  readonly askingDiscard = signal(false);
  readonly replacementId = signal('');
  readonly name = new FormControl('', { nonNullable: true });

  private loadVersion = 0;
  private dialogWorkspaceId: string | null = null;
  private releaseWorkspaceLock: (() => void) | null = null;

  readonly tableId: MasterDataTableId =
    this.section === 'sources'
      ? 'master_sources'
      : this.section === 'platforms'
        ? 'master_platforms'
        : 'master_brands';
  readonly tableConfig = MASTER_DATA_TABLE_CONFIGS[this.tableId];
  readonly tableState = computed(() =>
    this.preferences.getTablePreferences<MasterDataColumnId, 'name'>(
      this.tableId,
      this.workspaceId(),
    )(),
  );
  readonly columns = computed(() =>
    [...this.tableState().columns]
      .filter((column) => column.visible)
      .sort((a, b) => a.order - b.order),
  );
  readonly viewModified = computed(() =>
    tableStateDiffersFromDefaults(this.tableState(), this.tableConfig),
  );
  readonly allRows = computed<readonly MasterDataRow[]>(() => {
    if (this.section === 'brands') {
      return this.brands.brands().map((brand) => ({
        id: brand.id,
        name: brand.name,
        kind: 'Marke',
        isActive: null,
      }));
    }

    if (this.section === 'sources') {
      return this.managedSources()
        .filter((source) => source.workspace_id === this.workspaceId())
        .map((source) => ({
          id: source.id,
          name: source.name,
          kind: source.is_default ? 'Standardquelle' : 'Eigene Quelle',
          isActive: source.is_active !== false,
        }));
    }

    if (this.section === 'platforms') {
      return SALE_PLATFORM_OPTIONS.map((platform) => ({
        id: platform.value,
        name: platform.displayName,
        kind: 'Systemvorgabe',
        isActive: null,
      }));
    }

    return [];
  });
  readonly rows = computed(() =>
    selectMasterDataRows(
      this.allRows(),
      this.search(),
      this.section === 'sources' ? this.status() : 'all',
      this.tableState().sort.direction,
    ),
  );
  readonly replacementOptions = computed<readonly SelectOption<string>[]>(() => [
    { value: '', label: 'Zielmarke wählen' },
    ...this.allRows()
      .filter((row) => row.id !== this.selectedRow()?.id)
      .map((row) => ({ value: row.id, label: row.name })),
  ]);
  readonly dialogTitle = computed(() => {
    if (this.askingDiscard()) return 'Änderungen verwerfen?';

    const mode = this.dialogMode();
    if (mode === 'merge') return 'Marken zusammenführen';
    if (mode === 'archive') {
      return this.selectedRow()?.isActive === false
        ? 'Quelle wiederherstellen'
        : 'Quelle archivieren';
    }

    const label = this.section === 'brands' ? 'Marke' : 'Quelle';
    return `${label} ${mode === 'create' ? 'anlegen' : 'bearbeiten'}`;
  });

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceId();
      untracked(() => {
        this.managedSources.set([]);
        this.search.set('');
        this.status.set('active');
        this.dismissDialog();
        void this.reload(workspaceId);
      });
    });

    this.destroyRef.onDestroy(() => {
      this.loadVersion++;
      this.releaseWorkspaceLock?.();
    });
  }

  async reload(workspaceId = this.workspaceId()): Promise<void> {
    const version = ++this.loadVersion;
    this.loadError.set(null);

    if (!workspaceId || this.section === 'sellers' || this.section === 'platforms') {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    try {
      if (this.section === 'brands') {
        await this.brands.reload();
        if (this.brands.loadError()) throw this.brands.loadError();
      } else {
        const result = await this.sources.getManagementSources();
        if (result.error) throw result.error;
        if (version === this.loadVersion && workspaceId === this.workspaceId()) {
          this.managedSources.set(result.data);
        }
      }
    } catch (error: unknown) {
      if (version === this.loadVersion && workspaceId === this.workspaceId()) {
        this.loadError.set(
          error instanceof Error ? error.message : 'Stammdaten konnten nicht geladen werden.',
        );
      }
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }

  toggleColumn(id: MasterDataColumnId): void {
    this.preferences.toggleColumnVisibility(this.tableId, id, this.workspaceId());
  }

  reorderColumns(event: { previousIndex: number; currentIndex: number }): void {
    this.preferences.reorderColumns(
      this.tableId,
      event.previousIndex,
      event.currentIndex,
      this.workspaceId(),
    );
  }

  changeSort(sort: TableSortState<'name'>): void {
    this.preferences.setSort(this.tableId, sort, this.workspaceId());
  }

  resetView(): void {
    this.preferences.resetToDefaults(this.tableId, this.workspaceId());
  }

  create(): void {
    if (!this.canEdit() || this.loading() || this.isSaving() || this.section === 'platforms')
      return;

    if (this.section === 'sellers') this.sellers()?.openCreateDialog();
    else this.openDialog('create');
  }

  edit(row: MasterDataRow): void {
    if (this.canEdit() && (this.section === 'brands' || this.section === 'sources')) {
      this.openDialog('edit', row);
    }
  }

  merge(row: MasterDataRow): void {
    if (this.canManage() && this.section === 'brands') this.openDialog('merge', row);
  }

  archive(row: MasterDataRow): void {
    if (this.canManage() && this.section === 'sources') this.openDialog('archive', row);
  }

  hasUnsavedChanges(): boolean {
    if (this.section === 'sellers') return this.sellers()?.hasUnsavedChanges() ?? false;
    return this.dialogMode() !== null && (this.name.dirty || this.replacementId() !== '');
  }

  isSaving(): boolean {
    return this.section === 'sellers' ? (this.sellers()?.isSaving() ?? false) : this.saving();
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges() || this.isSaving()) event.preventDefault();
  }

  requestClose(): void {
    if (this.saving()) return;

    if (this.askingDiscard()) this.askingDiscard.set(false);
    else if (this.hasUnsavedChanges()) this.askingDiscard.set(true);
    else this.dismissDialog();
  }

  dismissDialog(): void {
    this.dialogMode.set(null);
    this.askingDiscard.set(false);
    this.dialogWorkspaceId = null;
    this.releaseWorkspaceLock?.();
    this.releaseWorkspaceLock = null;
  }

  async save(): Promise<void> {
    const mode = this.dialogMode();
    const row = this.selectedRow();
    if (!mode || this.saving() || this.askingDiscard()) return;

    if (this.dialogWorkspaceId !== this.workspaceId() || !this.canEdit()) {
      this.dialogError.set('Der Workspace oder deine Berechtigung hat sich geändert.');
      return;
    }

    if ((mode === 'merge' || mode === 'archive') && !this.canManage()) {
      this.dialogError.set('Diese Aktion ist Inhabern und Administratoren vorbehalten.');
      return;
    }

    if (mode === 'create' || mode === 'edit') {
      const message = validateMasterDataName(this.name.value, this.allRows(), row?.id);
      if (message) {
        this.dialogError.set(message);
        return;
      }
    }

    if (
      mode === 'merge' &&
      (!row || !validMergeTarget(row.id, this.replacementId(), this.allRows()))
    ) {
      this.dialogError.set('Bitte eine andere, vorhandene Zielmarke wählen.');
      return;
    }

    if (mode !== 'create' && !row) return;

    const workspaceId = this.workspaceId();
    this.saving.set(true);
    this.dialogError.set(null);

    try {
      if (mode === 'merge' && row) {
        const result = await this.brands.replaceAndDelete(row.id, this.replacementId());
        if (result.error || !result.data) {
          throw result.error ?? new Error('Zusammenführen wurde nicht bestätigt.');
        }
      } else if (mode === 'archive' && row) {
        const result = await this.sources.setSourceArchiviert(row.id, row.isActive !== false);
        if (result.error) throw result.error;
      } else if (this.section === 'brands') {
        const result =
          mode === 'create'
            ? await this.brands.create(this.name.value)
            : await this.brands.rename(row!.id, this.name.value);
        if (result.error || !result.data) {
          throw result.error ?? new Error('Speichern wurde nicht bestätigt.');
        }
      } else if (this.section === 'sources') {
        const result =
          mode === 'create'
            ? await this.sources.createSource(this.name.value)
            : await this.sources.updateSource(row!.id, { name: this.name.value });
        if (result.error) throw result.error;
      } else {
        return;
      }

      if (workspaceId !== this.workspaceId() || this.destroyRef.destroyed) return;

      this.dismissDialog();
      await this.reload(workspaceId);

      if (!this.destroyRef.destroyed && workspaceId === this.workspaceId()) {
        const message =
          mode === 'merge'
            ? 'Marken wurden zusammengeführt.'
            : mode === 'archive'
              ? row?.isActive === false
                ? 'Quelle wurde wiederhergestellt.'
                : 'Quelle wurde archiviert.'
              : 'Eintrag wurde gespeichert.';
        this.toast.success(message);
      }
    } catch (error: unknown) {
      if (!this.destroyRef.destroyed) {
        this.dialogError.set(
          error instanceof Error ? error.message : 'Die Änderung konnte nicht gespeichert werden.',
        );
      }
    } finally {
      if (!this.destroyRef.destroyed) this.saving.set(false);
    }
  }

  private openDialog(mode: DialogMode, row: MasterDataRow | null = null): void {
    if (this.saving() || this.loading() || !this.workspaceId()) return;

    this.dismissDialog();
    this.dialogWorkspaceId = this.workspaceId();
    this.releaseWorkspaceLock = this.context.acquire();
    this.selectedRow.set(row);
    this.name.reset(row?.name ?? '');
    this.replacementId.set('');
    this.dialogError.set(null);
    this.dialogMode.set(mode);
  }
}
