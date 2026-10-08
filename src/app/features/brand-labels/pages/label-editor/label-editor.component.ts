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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LucideArrowDown, LucideArrowUp, LucideTrash2 } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { BrandLabelAdminService, adminError } from '../../services/brand-label-admin.service';
import { BrandLabelAdminBrandsService } from '../../services/brand-label-admin-brands.service';
import { LabelMediaService } from '../../services/label-media.service';
import { LabelImageComponent } from '../../components/label-image/label-image.component';
import {
  readAdminDraft,
  prepareAdminCommand,
  type LabelAdminCommand,
  type LabelAdminReference,
} from '../../models/brand-label-admin';
import {
  prepareLabelRevisionCommand,
  type LabelRevisionCommand,
} from '../../models/brand-label-rpc';
import type { LabelRevisionAction } from '../../models/brand-label-revision';
import type {
  LabelDraft,
  LabelDraftInput,
  LabelSource,
  LabelInterval,
  LabelCheckHint,
  LabelImageAssignment,
  LabelEvidenceLevel,
  LabelKind,
} from '../../models/brand-label.models';
import { createEmptyLabelContent } from '../../models/brand-label-content';
import type { LabelAdminBrand } from '../../models/brand-label-admin-brands';
const text = (value = '') => new FormControl(value, { nonNullable: true });
const sourceForm = (
  source: LabelSource = {
    id: crypto.randomUUID(),
    title: '',
    publisher: '',
    url: '',
    accessedAt: null,
    locator: '',
  },
) =>
  new FormGroup({
    id: text(source.id),
    title: text(source.title),
    publisher: text(source.publisher),
    url: text(source.url),
    accessedAt: text(source.accessedAt ?? ''),
    locator: text(source.locator),
  });
const intervalForm = (
  interval: LabelInterval = { startYear: null, endYear: null, sourceIds: [] },
) =>
  new FormGroup({
    startYear: text(interval.startYear?.toString() ?? ''),
    endYear: text(interval.endYear?.toString() ?? ''),
    sourceIds: text(interval.sourceIds.join('\n')),
  });
const hintForm = (hint: LabelCheckHint = { text: '', sourceIds: [] }) =>
  new FormGroup({ text: text(hint.text), sourceIds: text(hint.sourceIds.join('\n')) });
const imageForm = (image: LabelImageAssignment) =>
  new FormGroup({
    assetId: new FormControl(image.assetId, { nonNullable: true }),
    caption: text(image.caption),
    alt: text(image.alt),
    referenceItem: text(image.referenceItem),
  });
const lines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
type Pending = LabelAdminCommand | LabelRevisionCommand;
interface EditorState {
  scope: string | null;
  reference: LabelAdminReference | null;
  brands: readonly LabelAdminBrand[];
  busy: boolean;
  pending: Pending | null;
  error: string | null;
  message: string | null;
  conflict: boolean;
}
const empty = (scope: string | null): EditorState => ({
  scope,
  reference: null,
  brands: [],
  busy: false,
  pending: null,
  error: null,
  message: null,
  conflict: false,
});
@Component({
  selector: 'app-label-editor',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    ButtonComponent,
    TextFieldComponent,
    CustomSelectComponent,
    LabelImageComponent,
  ],
  templateUrl: './label-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'warnUnsaved($event)' },
})
export class LabelEditorComponent {
  private readonly service = inject(BrandLabelAdminService);
  private readonly brandsService = inject(BrandLabelAdminBrandsService);
  private readonly media = inject(LabelMediaService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly operator = inject(PlatformOperatorService);
  private readonly destroy = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private generation = 0;
  private original = '';
  readonly scope = computed(() => {
    const user = this.auth.currentUser()?.id;
    return user && this.operator.operator()
      ? `${user}:${this.workspace.currentWorkspace()?.id ?? ''}:${this.params().get('id') ?? ''}`
      : null;
  });
  private readonly state = signal<EditorState>(empty(null));
  readonly view = computed(() =>
    !this.destroy.destroyed && this.scope() && this.state().scope === this.scope()
      ? this.state()
      : empty(null),
  );
  readonly imageOptions = signal<readonly { value: number; label: string }[]>([]);
  readonly selectedImage = signal<number | null>(null);
  readonly deleteIcon = LucideTrash2;
  readonly upIcon = LucideArrowUp;
  readonly downIcon = LucideArrowDown;
  readonly evidenceOptions = [
    { value: 'undated', label: 'Nicht datiert' },
    { value: 'partially-supported', label: 'Teilweise belegt' },
    { value: 'well-supported', label: 'Gut belegt' },
  ];
  readonly kindOptions = [
    { value: '', label: 'Keine Zuordnung' },
    { value: 'neck-label', label: 'Nackenlabel' },
    { value: 'care-size-label', label: 'Pflege-/Größenlabel' },
    { value: 'both', label: 'Beide Labelarten' },
  ];
  readonly lineOptions = computed(() => [
    { value: null, label: 'Keine Markenlinie' },
    ...(this.view()
      .brands.find((brand) => brand.id === this.view().reference?.brandId)
      ?.lines.filter((line) => !line.archived)
      .map((line) => ({ value: line.id, label: line.name })) ?? []),
  ]);
  readonly form = new FormGroup({
    title: text(),
    aliases: text(),
    brandLineId: new FormControl<number | null>(null),
    kinds: text(),
    timeSummary: text(),
    evidenceLevel: new FormControl<LabelEvidenceLevel>('undated', { nonNullable: true }),
    features: text(),
    limitations: text(),
    relatedReferenceIds: text(),
    reviewedAt: text(),
    sources: new FormArray<ReturnType<typeof sourceForm>>([]),
    intervals: new FormArray<ReturnType<typeof intervalForm>>([]),
    checkHints: new FormArray<ReturnType<typeof hintForm>>([]),
    images: new FormArray<ReturnType<typeof imageForm>>([]),
  });
  constructor() {
    effect(() => {
      const scope = this.scope();
      const referenceId = Number(this.params().get('id'));
      untracked(() => {
        this.clearForm();
        this.imageOptions.set([]);
        void this.load(scope, referenceId);
      });
    });
    this.destroy.onDestroy(() => {
      this.generation++;
      this.clearForm();
      this.state.set(empty(null));
    });
  }
  private clearForm() {
    this.form.reset();
    this.form.controls.sources.clear();
    this.form.controls.intervals.clear();
    this.form.controls.checkHints.clear();
    this.form.controls.images.clear();
    this.form.disable();
    this.original = '';
    this.selectedImage.set(null);
  }
  private setDraft(draft: LabelDraft | null) {
    this.clearForm();
    if (!draft) return;
    const content = draft.input.content;
    this.form.reset({
      title: content.title,
      aliases: content.aliases.join('\n'),
      brandLineId: content.brandLineId,
      kinds: content.kinds.length === 2 ? 'both' : (content.kinds[0] ?? ''),
      timeSummary: content.timeSummary,
      evidenceLevel: content.evidenceLevel,
      features: content.features.join('\n'),
      limitations: content.limitations.join('\n'),
      relatedReferenceIds: content.relatedReferenceIds.join('\n'),
      reviewedAt: content.reviewedAt ?? '',
    });
    for (const source of content.sources) this.form.controls.sources.push(sourceForm(source));
    for (const interval of content.intervals)
      this.form.controls.intervals.push(intervalForm(interval));
    for (const hint of content.checkHints) this.form.controls.checkHints.push(hintForm(hint));
    for (const image of draft.input.images) this.form.controls.images.push(imageForm(image));
    this.original = JSON.stringify(this.form.getRawValue());
    if (!this.view().reference?.archived && !this.view().reference?.brandArchived)
      this.form.enable();
  }
  input(): LabelDraftInput {
    const value = this.form.getRawValue();
    const kinds: LabelKind[] =
      value.kinds === 'both'
        ? ['neck-label', 'care-size-label']
        : value.kinds === 'neck-label' || value.kinds === 'care-size-label'
          ? [value.kinds]
          : [];
    return {
      content: {
        ...createEmptyLabelContent(),
        title: value.title,
        aliases: lines(value.aliases),
        brandLineId: value.brandLineId,
        brandName: this.view().reference?.draft?.input.content.brandName ?? '',
        brandLineName: this.view().reference?.draft?.input.content.brandLineName ?? null,
        kinds,
        timeSummary: value.timeSummary,
        evidenceLevel: value.evidenceLevel,
        features: lines(value.features),
        limitations: lines(value.limitations),
        relatedReferenceIds: lines(value.relatedReferenceIds).map(Number),
        reviewedAt: value.reviewedAt || null,
        sources: value.sources.map((source) => ({
          ...source,
          accessedAt: source.accessedAt || null,
        })),
        intervals: value.intervals.map((interval) => ({
          startYear: interval.startYear === '' ? null : Number(interval.startYear),
          endYear: interval.endYear === '' ? null : Number(interval.endYear),
          sourceIds: lines(interval.sourceIds),
        })),
        checkHints: value.checkHints.map((hint) => ({ ...hint, sourceIds: lines(hint.sourceIds) })),
      },
      images: value.images.map((image, position) => ({ ...image, position })),
    };
  }
  canChange() {
    const reference = this.view().reference;
    return (
      !!reference?.draft &&
      !reference.archived &&
      !reference.brandArchived &&
      !this.view().busy &&
      !this.view().pending &&
      !this.view().conflict
    );
  }
  addSource() {
    if (this.canChange()) this.form.controls.sources.push(sourceForm());
  }
  addInterval() {
    if (this.canChange()) this.form.controls.intervals.push(intervalForm());
  }
  addHint() {
    if (this.canChange()) this.form.controls.checkHints.push(hintForm());
  }
  removeSource(index: number) {
    if (this.canChange()) this.form.controls.sources.removeAt(index);
  }
  removeInterval(index: number) {
    if (this.canChange()) this.form.controls.intervals.removeAt(index);
  }
  removeHint(index: number) {
    if (this.canChange()) this.form.controls.checkHints.removeAt(index);
  }
  removeImage(index: number) {
    if (this.canChange()) this.form.controls.images.removeAt(index);
  }
  addImage() {
    const assetId = this.selectedImage();
    if (
      !this.canChange() ||
      !assetId ||
      this.form.controls.images.controls.some((image) => image.controls.assetId.value === assetId)
    )
      return;
    this.form.controls.images.push(
      imageForm({
        assetId,
        position: this.form.controls.images.length,
        caption: '',
        alt: '',
        referenceItem: '',
      }),
    );
    this.selectedImage.set(null);
  }
  moveImage(index: number, direction: number) {
    if (!this.canChange()) return;
    const target = index + direction;
    const array = this.form.controls.images;
    const control = array.at(index);
    if (target < 0 || target >= array.length || !control) return;
    array.removeAt(index);
    array.insert(target, control);
  }
  async beginEdit() {
    const reference = this.view().reference;
    if (
      !reference ||
      reference.draft ||
      reference.archived ||
      reference.brandArchived ||
      this.view().busy ||
      this.view().pending
    )
      return;
    await this.execute(
      prepareAdminCommand({
        action: 'edit',
        referenceId: reference.referenceId,
        requestId: crypto.randomUUID(),
      }),
    );
  }
  async revise(action: LabelRevisionAction) {
    const draft = this.view().reference?.draft;
    if (!draft || !this.canChange()) return;
    if (action !== 'save' && this.hasUnsavedChanges()) {
      this.state.update((state) => ({ ...state, error: 'Speichere zuerst Deine Änderungen.' }));
      return;
    }
    if (
      (action === 'publish' || action === 'discard') &&
      !globalThis.confirm(
        action === 'publish'
          ? 'Geprüften Entwurf jetzt veröffentlichen?'
          : 'Entwurf endgültig verwerfen?',
      )
    )
      return;
    try {
      await this.execute(
        prepareLabelRevisionCommand(
          action,
          { ...draft, input: action === 'save' ? this.input() : draft.input },
          crypto.randomUUID(),
        ),
      );
    } catch {
      this.state.update((state) => ({
        ...state,
        error: 'Bitte prüfe Angaben, Quellenverweise und Bildzuordnung.',
      }));
    }
  }
  async archive() {
    const reference = this.view().reference;
    if (!reference || this.view().busy || this.view().pending) return;
    if (
      !globalThis.confirm(
        reference.archived
          ? 'Referenz als Entwurf wiederherstellen? Sie wird nicht automatisch veröffentlicht.'
          : 'Referenz archivieren? Sie verschwindet aus der Leseransicht.',
      )
    )
      return;
    if (this.hasUnsavedChanges() && !globalThis.confirm('Nicht gespeicherte Eingaben verwerfen?'))
      return;
    await this.execute(
      prepareAdminCommand({
        action: reference.archived ? 'restore' : 'archive',
        referenceId: reference.referenceId,
        expectedVersion: reference.version,
        requestId: crypto.randomUUID(),
      }),
    );
  }
  async retry() {
    const command = this.view().pending;
    if (command && !this.view().busy) await this.execute(command);
  }
  private async execute(command: Pending) {
    const scope = this.scope();
    if (!scope || !this.view().reference) return;
    const generation = this.generation;
    this.form.disable();
    this.state.update((state) => ({
      ...state,
      busy: true,
      pending: command,
      error: null,
      message: null,
    }));
    try {
      const result =
        'revisionId' in command
          ? await this.service.revision(command)
          : await this.service.execute(command);
      if (!this.current(scope, generation)) return;
      this.state.update((state) => ({
        ...state,
        busy: false,
        pending: null,
        message: 'Auftrag bestätigt.',
        conflict: false,
      }));
      if ('input' in result) {
        const draft = readAdminDraft(result);
        if (!draft) throw new Error('Invalid draft');
        this.state.update((state) => ({
          ...state,
          reference: state.reference ? { ...state.reference, draft: draft } : null,
        }));
        this.setDraft(draft);
      } else {
        await this.load(scope, result.referenceId, true);
      }
    } catch (error) {
      if (!this.current(scope, generation)) return;
      const safe = adminError(error);
      if (safe.code === 'forbidden' || safe.code === 'unauthorized') {
        this.state.set(empty(null));
        this.clearForm();
        this.imageOptions.set([]);
        return;
      }
      this.state.update((state) => ({
        ...state,
        busy: false,
        pending: safe.code === 'network' ? command : null,
        error: safe.message,
        conflict: safe.code === 'conflict',
      }));
      if (safe.code !== 'network') this.form.enable();
    }
  }
  async reload() {
    if (this.view().busy) return;
    if (
      (this.hasUnsavedChanges() || this.view().pending) &&
      !globalThis.confirm(
        'Serverstand laden? Deine lokalen Eingaben werden verworfen. Ein unbestätigter Auftrag kann bereits gespeichert worden sein.',
      )
    )
      return;
    await this.load(this.scope(), Number(this.params().get('id')));
  }
  private async load(scope: string | null, referenceId: number, confirmed = false) {
    const generation = ++this.generation;
    this.state.set(empty(scope));
    this.clearForm();
    if (!scope || !Number.isInteger(referenceId) || referenceId < 1) return;
    this.state.update((state) => ({ ...state, busy: true }));
    try {
      const [reference, brands, images] = await Promise.all([
        this.service.detail(referenceId),
        this.brandsService.list(),
        this.media.list(),
      ]);
      if (!this.current(scope, generation)) return;
      this.state.set({
        ...empty(scope),
        reference,
        brands,
        message: confirmed
          ? 'Auftrag bestätigt. Wiederhergestellte Referenzen müssen erneut geprüft und veröffentlicht werden.'
          : null,
      });
      this.imageOptions.set(
        images
          .filter((image) => image.status === 'approved')
          .map((image) => ({
            value: image.assetId,
            label: `Bild ${image.assetId} · ${image.attribution}`,
          })),
      );
      this.setDraft(reference?.draft ?? null);
    } catch (error) {
      if (this.current(scope, generation))
        this.state.set({ ...empty(scope), error: adminError(error).message });
    }
  }
  private current(scope: string, generation: number) {
    return !this.destroy.destroyed && scope === this.scope() && generation === this.generation;
  }
  hasUnsavedChanges() {
    return (
      this.view().pending !== null ||
      (!!this.view().reference?.draft && this.original !== JSON.stringify(this.form.getRawValue()))
    );
  }
  isSaving() {
    return this.view().busy && this.view().pending !== null;
  }
  warnUnsaved(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges() || this.isSaving()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
