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
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucidePencil, LucidePlus } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { BrandLabelAdminBrandsService } from '../../services/brand-label-admin-brands.service';
import {
  LabelBrandAdminError,
  prepareLabelBrandEdit,
  type LabelAdminBrand,
  type LabelAdminLine,
  type LabelBrandEdit,
  type LabelBrandEditResult,
} from '../../models/brand-label-admin-brands';

interface BrandFormValue {
  name: string;
  slug: string;
  aliases: string;
}
interface BrandEditor {
  kind: 'brand' | 'line';
  id: number | null;
  version: number | null;
  brandId: number | null;
  brandName: string;
  original: BrandFormValue;
}
interface BrandAdminView {
  scope: string | null;
  phase: 'loading' | 'ready' | 'unavailable' | 'error';
  brands: readonly LabelAdminBrand[];
  editor: BrandEditor | null;
  busy: boolean;
  pending: LabelBrandEdit | null;
  conflict: boolean;
  error: string | null;
  actionError: string | null;
  message: string | null;
}
const emptyForm = (): BrandFormValue => ({ name: '', slug: '', aliases: '' });
const emptyView = (scope: string | null): BrandAdminView => ({
  scope,
  phase: scope ? 'loading' : 'unavailable',
  brands: [],
  editor: null,
  busy: false,
  pending: null,
  conflict: false,
  error: null,
  actionError: null,
  message: null,
});

@Component({
  selector: 'app-label-brands',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    DataTableComponent,
    ButtonComponent,
    BadgeComponent,
    TextFieldComponent,
    ModalShellComponent,
  ],
  templateUrl: './label-brands.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'warnUnsaved($event)' },
})
export class LabelBrandsComponent {
  private readonly service = inject(BrandLabelAdminBrandsService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly operator = inject(PlatformOperatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly state = signal<BrandAdminView>(emptyView(null));
  private generation = 0;
  private readonly scope = computed(() => {
    const user = this.auth.currentUser()?.id;
    return user && this.operator.operator()
      ? `${user}:${this.workspace.currentWorkspace()?.id ?? ''}`
      : null;
  });

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true }),
    slug: new FormControl('', { nonNullable: true }),
    aliases: new FormControl('', { nonNullable: true }),
  });
  readonly view = computed(() => {
    const scope = this.scope();
    const state = this.state();
    return !this.destroyRef.destroyed && scope !== null && state.scope === scope
      ? state
      : emptyView(scope);
  });
  readonly editor = computed(() => this.view().editor);
  readonly saving = computed(() => this.view().busy);
  readonly unresolved = computed(() => this.view().pending !== null);
  readonly message = computed(() => this.view().message);
  readonly search = signal('');
  readonly visibleBrands = computed(() => {
    const query = this.search().trim().normalize('NFC').toLocaleLowerCase('de');
    return this.view().brands.filter((brand) =>
      [brand.name, ...brand.aliases, ...brand.lines.map((line) => line.name)].some((text) =>
        text.normalize('NFC').toLocaleLowerCase('de').includes(query),
      ),
    );
  });
  readonly plusIcon = LucidePlus;
  readonly editIcon = LucidePencil;

  constructor() {
    effect(() => {
      const scope = this.scope();
      untracked(() => {
        this.form.reset(emptyForm());
        this.form.disable();
        this.search.set('');
        void this.load(scope);
      });
    });
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.state.set(emptyView(null));
      this.form.reset(emptyForm());
      this.form.disable();
    });
  }

  private canOpen(): boolean {
    return this.view().phase === 'ready' && !this.editor() && !this.saving() && !this.unresolved();
  }
  beginBrand(brand?: LabelAdminBrand): void {
    if (!this.canOpen()) return;
    const current = brand ? this.view().brands.find((entry) => entry.id === brand.id) : null;
    if (brand && (!current || current.archived)) return;
    this.open({
      kind: 'brand',
      id: current?.id ?? null,
      version: current?.version ?? null,
      brandId: null,
      brandName: '',
      original: current
        ? { name: current.name, slug: current.slug, aliases: current.aliases.join('\n') }
        : emptyForm(),
    });
  }
  beginLine(brand: LabelAdminBrand, line?: LabelAdminLine): void {
    if (!this.canOpen()) return;
    const current = this.view().brands.find((entry) => entry.id === brand.id);
    const selected = line ? current?.lines.find((entry) => entry.id === line.id) : null;
    if (!current || current.archived || (line && (!selected || selected.archived))) return;
    this.open({
      kind: 'line',
      id: selected?.id ?? null,
      version: selected?.version ?? null,
      brandId: current.id,
      brandName: current.name,
      original: { name: selected?.name ?? '', slug: '', aliases: '' },
    });
  }
  private open(editor: BrandEditor): void {
    this.form.reset(editor.original);
    this.form.enable();
    this.state.update((state) => ({
      ...state,
      editor,
      actionError: null,
      message: null,
      conflict: false,
    }));
  }
  async save(): Promise<void> {
    const editor = this.editor();
    if (!editor || this.saving() || this.unresolved() || this.view().conflict) return;
    const input = this.form.getRawValue();
    let command: LabelBrandEdit;
    try {
      command = prepareLabelBrandEdit({
        kind: editor.kind,
        id: editor.id,
        expectedVersion: editor.version,
        requestId: crypto.randomUUID(),
        input:
          editor.kind === 'brand'
            ? {
                name: input.name.trim(),
                slug: input.slug.trim(),
                aliases: input.aliases
                  .split('\n')
                  .map((alias) => alias.trim())
                  .filter(Boolean),
              }
            : { brandId: editor.brandId, name: input.name.trim() },
      });
    } catch {
      this.state.update((state) => ({
        ...state,
        actionError: new LabelBrandAdminError('validation').message,
      }));
      return;
    }
    await this.execute(command);
  }
  async retry(): Promise<void> {
    const command = this.view().pending;
    if (command && !this.saving()) await this.execute(command);
  }
  private async execute(command: LabelBrandEdit): Promise<void> {
    const scope = this.scope();
    if (!scope || !this.editor()) return;
    const generation = this.generation;
    this.form.disable();
    this.state.update((state) => ({
      ...state,
      busy: true,
      pending: command,
      actionError: null,
      message: null,
    }));
    try {
      const result = await this.service.execute(command);
      if (!this.current(scope, generation)) return;
      this.applyResult(result);
      this.form.reset(emptyForm());
    } catch (error) {
      if (!this.current(scope, generation)) return;
      const safe =
        error instanceof LabelBrandAdminError ? error : new LabelBrandAdminError('network');
      if (safe.code === 'forbidden') {
        this.state.set({ ...emptyView(scope), phase: 'unavailable' });
        this.form.reset(emptyForm());
      } else {
        this.state.update((state) => ({
          ...state,
          busy: false,
          pending: safe.code === 'network' ? command : null,
          conflict: safe.code === 'conflict',
          actionError: safe.message,
        }));
        if (safe.code !== 'network') this.form.enable();
      }
    }
  }
  private applyResult(result: LabelBrandEditResult): void {
    this.state.update((state) => {
      let brands = [...state.brands];
      if (result.kind === 'brand') {
        const previous = brands.find((brand) => brand.id === result.value.id);
        const updated = { ...result.value, lines: previous?.lines ?? [] };
        brands = [...brands.filter((brand) => brand.id !== updated.id), updated];
      } else {
        brands = brands.map((brand) =>
          brand.id !== result.value.brandId
            ? brand
            : {
                ...brand,
                lines: [
                  ...brand.lines.filter((line) => line.id !== result.value.id),
                  result.value,
                ].sort((a, b) => a.name.localeCompare(b.name, 'de') || a.id - b.id),
              },
        );
      }
      brands.sort((a, b) => a.name.localeCompare(b.name, 'de') || a.id - b.id);
      return {
        ...state,
        brands,
        editor: null,
        busy: false,
        pending: null,
        conflict: false,
        actionError: null,
        message: 'Referenzangaben gespeichert. Veröffentlichte Labels bleiben unverändert.',
      };
    });
  }
  close(): void {
    if (!this.editor() || this.saving() || this.unresolved()) return;
    if (this.hasUnsavedChanges() && !globalThis.confirm('Nicht gespeicherte Eingaben verwerfen?'))
      return;
    this.form.reset(emptyForm());
    this.form.disable();
    this.state.update((state) => ({ ...state, editor: null, actionError: null, conflict: false }));
  }
  async reload(): Promise<void> {
    if (this.saving()) return;
    if (
      (this.hasUnsavedChanges() || this.unresolved()) &&
      !globalThis.confirm(
        'Aktuellen Serverstand laden? Deine lokalen Eingaben werden verworfen. Ein unbestätigter Auftrag kann bereits gespeichert worden sein.',
      )
    )
      return;
    this.form.reset(emptyForm());
    this.form.disable();
    await this.load(this.scope());
  }
  hasUnsavedChanges(): boolean {
    const editor = this.editor();
    return (
      editor !== null &&
      (this.unresolved() ||
        JSON.stringify(editor.original) !== JSON.stringify(this.form.getRawValue()))
    );
  }
  isSaving(): boolean {
    return this.saving();
  }
  warnUnsaved(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges() || this.saving()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  private current(scope: string, generation: number): boolean {
    return !this.destroyRef.destroyed && scope === this.scope() && generation === this.generation;
  }
  private async load(scope: string | null): Promise<void> {
    const generation = ++this.generation;
    this.state.set(emptyView(scope));
    if (!scope) return;
    try {
      const brands = await this.service.list();
      if (this.current(scope, generation))
        this.state.set({ ...emptyView(scope), phase: 'ready', brands });
    } catch (error) {
      if (!this.current(scope, generation)) return;
      const safe =
        error instanceof LabelBrandAdminError ? error : new LabelBrandAdminError('network');
      this.state.set({
        ...emptyView(scope),
        phase: safe.code === 'forbidden' ? 'unavailable' : 'error',
        error: safe.message,
      });
    }
  }
}
