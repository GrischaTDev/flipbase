import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucidePlus } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { BrandLabelAdminService, adminError } from '../../services/brand-label-admin.service';
import { BrandLabelAdminBrandsService } from '../../services/brand-label-admin-brands.service';
import {
  prepareReaderCommand,
  type LabelReaderCommand,
  prepareAdminCommand,
  type LabelAdminCommand,
  type LabelAdminFilter,
  type LabelAdminPage,
  type LabelAdminState,
} from '../../models/brand-label-admin';
import type { LabelAdminBrand } from '../../models/brand-label-admin-brands';
@Component({
  selector: 'app-label-admin',
  imports: [
    RouterLink,
    PageHeaderComponent,
    ButtonComponent,
    DataTableComponent,
    CustomSelectComponent,
  ],
  templateUrl: './label-admin.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'warnUnsaved($event)' },
})
export class LabelAdminComponent {
  private readonly service = inject(BrandLabelAdminService);
  private readonly brandsService = inject(BrandLabelAdminBrandsService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly operator = inject(PlatformOperatorService);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  readonly scope = computed(() => {
    const user = this.auth.currentUser()?.id;
    return user && this.operator.operator()
      ? `${user}:${this.workspace.currentWorkspace()?.id ?? ''}`
      : null;
  });
  private readonly state = signal<{
    scope: string | null;
    page: LabelAdminPage | null;
    brands: readonly LabelAdminBrand[];
    busy: boolean;
    pending: LabelAdminCommand | LabelReaderCommand | null;
    readerEnabled: boolean | null;
    message: string | null;
    error: string | null;
    offset: number;
  }>({
    scope: null,
    page: null,
    brands: [],
    busy: false,
    pending: null,
    error: null,
    offset: 0,
    readerEnabled: null,
    message: null,
  });
  readonly view = computed(() =>
    this.scope() && this.state().scope === this.scope()
      ? this.state()
      : {
          scope: null,
          page: null,
          brands: [],
          busy: false,
          pending: null,
          error: null,
          offset: 0,
          readerEnabled: null,
          message: null,
        },
  );
  readonly search = signal('');
  readonly selectedBrand = signal<number | null>(null);
  readonly selectedState = signal<LabelAdminState>('all');
  readonly createBrand = signal<number | null>(null);
  readonly plusIcon = LucidePlus;
  readonly statusLabels: Record<LabelAdminState, string> = {
    all: 'Alle',
    draft: 'Entwurf',
    review: 'In Prüfung',
    published: 'Veröffentlicht',
    unpublished: 'Unveröffentlicht',
    archived: 'Archiviert',
  };
  readonly stateOptions = [
    { value: 'all', label: 'Alle Status' },
    { value: 'draft', label: 'Entwurf' },
    { value: 'review', label: 'In Prüfung' },
    { value: 'published', label: 'Veröffentlicht' },
    { value: 'unpublished', label: 'Unveröffentlicht' },
    { value: 'archived', label: 'Archiviert' },
  ];
  readonly brandOptions = computed(() => [
    { value: null, label: 'Alle Marken' },
    ...this.view().brands.map((brand) => ({ value: brand.id, label: brand.name })),
  ]);
  readonly createOptions = computed(() =>
    this.view()
      .brands.filter((brand) => !brand.archived)
      .map((brand) => ({ value: brand.id, label: brand.name })),
  );
  private generation = 0;
  constructor() {
    effect(() => {
      const scope = this.scope();
      untracked(() => {
        this.search.set('');
        this.selectedBrand.set(null);
        this.selectedState.set('all');
        this.createBrand.set(null);
        void this.load(scope, 0);
      });
    });
    this.destroy.onDestroy(() => this.generation++);
  }
  changeState(value: string | null) {
    if (this.stateOptions.some((option) => option.value === value)) {
      const state = this.stateOptions.find((option) => option.value === value)?.value;
      if (
        state === 'all' ||
        state === 'draft' ||
        state === 'review' ||
        state === 'published' ||
        state === 'unpublished' ||
        state === 'archived'
      )
        this.selectedState.set(state);
      void this.load(this.scope(), 0);
    }
  }
  searchLabels() {
    void this.load(this.scope(), 0);
  }
  previous() {
    void this.load(this.scope(), Math.max(0, this.view().offset - 24));
  }
  next() {
    const offset = this.view().page?.nextOffset;
    if (offset !== null && offset !== undefined) void this.load(this.scope(), offset);
  }
  async setReader(enabled: boolean) {
    if (
      this.view().busy ||
      this.view().pending ||
      this.view().readerEnabled === null ||
      this.view().readerEnabled === enabled
    )
      return;
    if (
      !globalThis.confirm(
        enabled
          ? 'Veröffentlichte Labels jetzt für Leser mit gültigem Workspacezugang öffnen?'
          : 'Bibliothek für Leser schließen? Die Veröffentlichungen bleiben gespeichert.',
      )
    )
      return;
    await this.execute(prepareReaderCommand(enabled, crypto.randomUUID()));
  }
  async create() {
    const brandId = this.createBrand();
    if (!brandId || this.view().busy || this.view().pending) return;
    await this.execute(
      prepareAdminCommand({ action: 'create', brandId, requestId: crypto.randomUUID() }),
    );
  }
  async retry() {
    const command = this.view().pending;
    if (command && !this.view().busy) await this.execute(command);
  }
  private async execute(command: LabelAdminCommand | LabelReaderCommand) {
    const scope = this.scope();
    if (!scope) return;
    const generation = this.generation;
    this.state.update((state) => ({ ...state, busy: true, pending: command, error: null }));
    try {
      if (command.action === 'reader') {
        const enabled = await this.service.setReader(command);
        if (!this.current(scope, generation)) return;
        this.state.update((state) => ({
          ...state,
          readerEnabled: enabled,
          busy: false,
          pending: null,
          message: enabled ? 'Bibliothek für Leser geöffnet.' : 'Bibliothek für Leser geschlossen.',
        }));
        return;
      }
      const result = await this.service.execute(command);
      if (!this.current(scope, generation)) return;
      this.state.update((state) => ({ ...state, busy: false, pending: null }));
      await this.router.navigate(['/tools/brand-labels/admin/labels', result.referenceId]);
    } catch (error) {
      if (!this.current(scope, generation)) return;
      const safe = adminError(error);
      if (safe.code === 'forbidden') {
        this.clear(scope);
        return;
      }
      this.state.update((state) => ({
        ...state,
        busy: false,
        pending: safe.code === 'network' ? command : null,
        error:
          command.action === 'reader' && safe.code === 'validation'
            ? 'Veröffentliche zuerst mindestens ein Label mit freigegebenen Bildern. Erst dann kannst Du die Bibliothek für Leser öffnen.'
            : safe.message,
      }));
    }
  }
  private clear(scope: string | null) {
    this.state.set({
      scope,
      page: null,
      brands: [],
      busy: false,
      pending: null,
      error: null,
      offset: 0,
      readerEnabled: null,
      message: null,
    });
  }
  async reload() {
    if (this.view().busy) return;
    if (
      this.view().pending &&
      !globalThis.confirm(
        'Serverstand laden? Der unbestätigte Auftrag kann bereits gespeichert worden sein.',
      )
    )
      return;
    this.state.update((state) => ({ ...state, pending: null }));
    await this.load(this.scope(), 0);
  }
  private async load(scope: string | null, offset: number) {
    if (this.view().pending || this.view().busy) {
      if (this.state().scope === scope) return;
    }
    const generation = ++this.generation;
    this.clear(scope);
    if (!scope) return;
    this.state.update((state) => ({ ...state, busy: true, offset }));
    const filter: LabelAdminFilter = {
      brandId: this.selectedBrand(),
      state: this.selectedState(),
      search: this.search().trim(),
    };
    try {
      const [page, brands, readerEnabled] = await Promise.all([
        this.service.list(filter, offset),
        this.brandsService.list(),
        this.service.readerSettings(),
      ]);
      if (this.current(scope, generation))
        this.state.set({
          scope,
          page,
          brands,
          readerEnabled,
          message: null,
          busy: false,
          pending: null,
          error: null,
          offset,
        });
    } catch (error) {
      if (this.current(scope, generation))
        this.state.update((state) => ({ ...state, busy: false, error: adminError(error).message }));
    }
  }
  private current(scope: string, generation: number) {
    return !this.destroy.destroyed && scope === this.scope() && generation === this.generation;
  }
  hasUnsavedChanges() {
    return this.view().pending !== null;
  }
  isSaving() {
    return this.view().busy && this.view().pending !== null;
  }
  warnUnsaved(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
