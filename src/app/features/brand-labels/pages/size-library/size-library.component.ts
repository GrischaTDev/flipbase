import { LabelRpcError } from '../../models/brand-label-rpc';
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
import { ActivatedRoute } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideArchive, LucidePencil, LucidePlus, LucideRotateCcw } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { WorkspaceAccessService } from '../../../../core/services/workspace-access.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { BrandLabelAdminBrandsService } from '../../services/brand-label-admin-brands.service';
import {
  SizeReferenceService,
  type SizeReferenceCommand,
} from '../../services/size-reference.service';
import { readSizeContent, parseSizeTable, type SizeReference } from '../../models/size-reference';

const initial = () => ({
  title: '',
  brand: '',
  category: 'trousers',
  audience: 'unisex',
  measurement: 'body',
  notes: '',
  sourceTitle: '',
  sourceUrl: '',
  reviewedAt: '',
  columns: 'Größe; Bundumfang (cm); Innenbeinlänge (cm)',
  rows: '',
});
@Component({
  selector: 'app-size-library',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    CardComponent,
    ButtonComponent,
    BadgeComponent,
    DataTableComponent,
    TextFieldComponent,
    CustomSelectComponent,
    ModalShellComponent,
  ],
  templateUrl: './size-library.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'warnUnsaved($event)' },
})
export class SizeLibraryComponent {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly access = inject(WorkspaceAccessService);
  private readonly operator = inject(PlatformOperatorService);
  private readonly service = inject(SizeReferenceService);
  private readonly brands = inject(BrandLabelAdminBrandsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly admin = inject(ActivatedRoute).snapshot.data['admin'] === true;
  private readonly scope = computed(() => {
    const user = this.auth.currentUser()?.id;
    const workspace = this.workspace.currentWorkspace()?.id ?? '';
    const operator = this.operator.operator();
    const active = this.access
      .access()
      .some((entry) => entry.workspace_id === workspace && entry.access_status === 'active');
    return user && (this.admin ? operator : operator || active)
      ? `${user}:${workspace}:${operator}`
      : null;
  });
  private readonly response = signal<{ scope: string; items: readonly SizeReference[] } | null>(
    null,
  );
  readonly items = computed(() =>
    this.response()?.scope === this.scope() ? (this.response()?.items ?? []) : [],
  );
  readonly search = signal('');
  readonly categoryFilter = signal('');
  readonly audienceFilter = signal('');
  readonly brandFilter = signal('');
  readonly visibleItems = computed(() =>
    this.items().filter(
      (item) =>
        (!this.categoryFilter() || item.content.category === this.categoryFilter()) &&
        (!this.audienceFilter() || item.content.audience === this.audienceFilter()) &&
        (!this.brandFilter() || String(item.brandId) === this.brandFilter()) &&
        JSON.stringify([item.content.title, item.brandName, item.content.rows])
          .toLocaleLowerCase('de')
          .includes(this.search().toLocaleLowerCase('de')),
    ),
  );
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly selected = signal<SizeReference | null>(null);
  readonly editing = signal(false);
  readonly pending = signal<SizeReferenceCommand | null>(null);
  readonly brandOptions = signal<readonly { value: string; label: string }[]>([
    { value: '', label: 'Ohne Markenbindung' },
  ]);
  readonly readerBrands = computed(() => [
    { value: '', label: 'Alle Marken' },
    ...Array.from(
      new Map(
        this.items().flatMap((item) =>
          item.brandId && item.brandName ? [[item.brandId, item.brandName] as const] : [],
        ),
      ).entries(),
    ).map(([id, label]) => ({ value: String(id), label })),
  ]);
  readonly categoryOptions = [
    { value: 'trousers', label: 'Hosen' },
    { value: 'tops', label: 'Oberteile' },
    { value: 'shoes', label: 'Schuhe' },
    { value: 'other', label: 'Sonstige' },
  ];
  readonly categoryFilters = [{ value: '', label: 'Alle Kategorien' }, ...this.categoryOptions];
  readonly audienceOptions = [
    { value: 'women', label: 'Damen' },
    { value: 'men', label: 'Herren' },
    { value: 'unisex', label: 'Unisex' },
    { value: 'children', label: 'Kinder' },
  ];
  readonly audienceFilters = [{ value: '', label: 'Alle Zielgruppen' }, ...this.audienceOptions];
  readonly measurementOptions = [
    { value: 'body', label: 'Körpermaße' },
    { value: 'garment', label: 'Kleidungsmaße' },
  ];
  readonly editIcon = LucidePencil;
  readonly plusIcon = LucidePlus;
  readonly archiveIcon = LucideArchive;
  readonly restoreIcon = LucideRotateCcw;
  readonly form = new FormGroup(
    Object.fromEntries(
      Object.entries(initial()).map(([key, value]) => [
        key,
        new FormControl(value, { nonNullable: true }),
      ]),
    ),
  );
  private generation = 0;
  constructor() {
    effect(() => {
      const scope = this.scope();
      untracked(() => {
        this.clear();
        void this.load(scope);
      });
    });
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.clear();
    });
  }
  private clear(): void {
    this.response.set(null);
    this.selected.set(null);
    this.editing.set(false);
    this.pending.set(null);
    this.error.set(null);
    this.message.set(null);
    this.saving.set(false);
    this.search.set('');
    this.categoryFilter.set('');
    this.audienceFilter.set('');
    this.brandFilter.set('');
    this.brandOptions.set([{ value: '', label: 'Ohne Markenbindung' }]);
    this.form.reset(initial());
    this.form.disable();
  }
  private current(generation: number, scope: string): boolean {
    return !this.destroyRef.destroyed && generation === this.generation && scope === this.scope();
  }
  async load(scope = this.scope()): Promise<void> {
    if (!scope) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set(null);
    try {
      const items = await this.service.list(this.admin);
      const brands = this.admin ? await this.brands.list() : [];
      if (!this.current(generation, scope)) return;
      this.response.set({ scope, items });
      this.brandOptions.set([
        { value: '', label: 'Ohne Markenbindung' },
        ...brands
          .filter((brand) => !brand.archived)
          .map((brand) => ({ value: String(brand.id), label: brand.name })),
      ]);
    } catch (error) {
      if (this.current(generation, scope)) {
        this.response.set(null);
        if (error instanceof LabelRpcError && error.code === 'forbidden') this.clear();
        this.error.set('Die Größenreferenzen konnten nicht geladen werden. Bitte lade erneut.');
      }
    } finally {
      if (this.current(generation, scope)) this.loading.set(false);
    }
  }
  begin(reference?: SizeReference): void {
    if (!this.admin || !this.scope() || this.saving() || this.pending() || reference?.archived)
      return;
    this.selected.set(reference ?? null);
    this.editing.set(true);
    this.error.set(null);
    this.message.set(null);
    this.form.reset(
      reference
        ? {
            ...reference.content,
            brand: reference.brandId ? String(reference.brandId) : '',
            reviewedAt: reference.content.reviewedAt ?? '',
            columns: reference.content.columns.join('; '),
            rows: reference.content.rows.map((row) => row.join('; ')).join('\n'),
          }
        : initial(),
    );
    this.form.enable();
  }
  close(): void {
    if (
      this.saving() ||
      this.pending() ||
      (this.form.dirty && !globalThis.confirm('Nicht gespeicherte Eingaben verwerfen?'))
    )
      return;
    this.editing.set(false);
    this.selected.set(null);
    this.form.reset(initial());
    this.form.disable();
  }
  async save(publish: boolean): Promise<void> {
    if (!this.admin || !this.scope() || this.saving() || this.pending()) return;
    try {
      const values = this.form.getRawValue();
      const content = readSizeContent({
        title: values['title'],
        category: values['category'],
        audience: values['audience'],
        measurement: values['measurement'],
        notes: values['notes'],
        sourceTitle: values['sourceTitle'],
        sourceUrl: values['sourceUrl'],
        reviewedAt: values['reviewedAt'] || null,
        ...parseSizeTable(values['columns'] ?? '', values['rows'] ?? ''),
      });
      if (
        publish &&
        (!content.rows.length ||
          !content.sourceTitle.trim() ||
          !content.sourceUrl ||
          !content.reviewedAt)
      )
        throw new Error(
          'Für die Veröffentlichung brauchst Du Tabellenwerte, Quelle, Quellenlink und Prüfdatum.',
        );
      const selected = this.selected();
      this.pending.set(
        Object.freeze({
          kind: 'save',
          id: selected?.id ?? null,
          expectedVersion: selected?.version ?? null,
          requestId: crypto.randomUUID(),
          brandId: values['brand'] ? Number(values['brand']) : null,
          content,
          publish,
          archived: false,
        }),
      );
      await this.retry();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Bitte prüfe Deine Angaben.');
    }
  }
  async archive(reference: SizeReference): Promise<void> {
    if (
      !this.admin ||
      !this.scope() ||
      this.saving() ||
      this.pending() ||
      !globalThis.confirm(
        reference.archived ? 'Größentabelle wiederherstellen?' : 'Größentabelle archivieren?',
      )
    )
      return;
    this.pending.set(
      Object.freeze({
        kind: 'archive',
        id: reference.id,
        expectedVersion: reference.version,
        requestId: crypto.randomUUID(),
        brandId: null,
        content: null,
        publish: false,
        archived: !reference.archived,
      }),
    );
    await this.retry();
  }
  async retry(): Promise<void> {
    const command = this.pending();
    const scope = this.scope();
    if (!command || !scope || this.saving()) return;
    const generation = ++this.generation;
    this.saving.set(true);
    this.form.disable();
    this.error.set(null);
    try {
      await this.service.execute(command);
      if (!this.current(generation, scope)) return;
      this.pending.set(null);
      this.editing.set(false);
      this.form.reset(initial());
      this.message.set('Änderung gespeichert.');
      await this.load(scope);
    } catch (error) {
      if (this.current(generation, scope)) {
        if (error instanceof LabelRpcError && error.code === 'forbidden') this.clear();
        if (
          error instanceof LabelRpcError &&
          (error.code === 'validation' || error.code === 'conflict')
        ) {
          this.pending.set(null);
          this.form.enable();
        }
        this.error.set(
          error instanceof Error ? error.message : 'Die Änderung ist nicht bestätigt.',
        );
      }
    } finally {
      if (scope === this.scope() && !this.destroyRef.destroyed) this.saving.set(false);
    }
  }
  async reload(): Promise<void> {
    if (
      this.saving() ||
      ((this.pending() || this.form.dirty) &&
        !globalThis.confirm('Antwortstatus neu laden und lokale Eingaben verwerfen?'))
    )
      return;
    this.clear();
    await this.load();
  }
  hasUnsavedChanges(): boolean {
    return !!this.scope() && (this.form.dirty || this.pending() !== null);
  }
  isSaving(): boolean {
    return this.saving();
  }
  warnUnsaved(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  label(options: readonly { value: string; label: string }[], value: string): string {
    return options.find((option) => option.value === value)?.label ?? value;
  }
}
