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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import { ListingImageEditorComponent } from '../../../../shared/components/listing-image-editor/listing-image-editor.component';
import type { ListingImageDraft } from '../../../../shared/components/listing-image-editor/listing-image-draft';
import { VintedCategoryService } from '../../../platform-admin/services/vinted-category.service';
import type { VintedCategory } from '../../../platform-admin/models/vinted-category.model';
import { vintedCategorySource } from '../../../platform-admin/models/vinted-category-source';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { VintedListingDraftService } from '../../services/vinted-listing-draft.service';
import { VintedListingCategoryService } from '../../services/vinted-listing-category.service';
import {
  VintedListingImageService,
  vintedDraftImageError,
} from '../../services/vinted-listing-image.service';
import {
  emptyVintedListingContent,
  missingVintedListingVariables,
  parseVintedListingContent,
  parseVintedListingPrice,
  type VintedListingContent,
} from '../../models/vinted-listing-content';
import {
  VintedListingStorageError,
  type VintedListingDraft,
} from '../../models/vinted-listing-draft';
import { VintedListingTemplatePanelComponent } from '../vinted-listing-template-panel/vinted-listing-template-panel.component';
import { VintedListingJobPanelComponent } from '../vinted-listing-job-panel/vinted-listing-job-panel.component';
import { VintedListingBrandDialogComponent } from '../vinted-listing-brand-dialog/vinted-listing-brand-dialog.component';
import { VintedListingFieldsDialogComponent } from '../vinted-listing-fields-dialog/vinted-listing-fields-dialog.component';
import { VintedListingPublicationPreviewComponent } from '../vinted-listing-publication-preview/vinted-listing-publication-preview.component';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import type { VintedListingJob } from '../../models/vinted-listing-job';
import {
  applyVintedListingFieldSelection,
  type VintedListingFieldSelection,
} from '../../models/vinted-listing-field-selection';
import {
  validVintedListingBrand,
  type VintedListingBrandSelection,
} from '../../models/vinted-listing-brand-selection';

const textOptions = { nonNullable: true as const, validators: [Validators.maxLength(20000)] };
const labels = (text: string) =>
  text
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
@Component({
  selector: 'app-vinted-listing-editor',
  templateUrl: './vinted-listing-editor.component.html',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    CardComponent,
    CustomSelectComponent,
    EntryPageLayoutComponent,
    TextFieldComponent,
    TwoColumnLayoutComponent,
    NoticeBannerComponent,
    CategoryPickerComponent,
    ListingImageEditorComponent,
    VintedListingTemplatePanelComponent,
    VintedListingJobPanelComponent,
    VintedListingBrandDialogComponent,
    VintedListingFieldsDialogComponent,
    VintedListingPublicationPreviewComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [VintedListingCategoryService],
  host: { class: 'block min-w-0', '(window:beforeunload)': 'beforeUnload($event)' },
})
export class VintedListingEditorComponent {
  readonly store = inject(MarketplaceAccountStore);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(VintedListingDraftService);
  private readonly imageApi = inject(VintedListingImageService);
  private readonly categoryApi = inject(VintedCategoryService);
  private readonly dialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly context = computed(() => {
    const user = this.auth.currentUser();
    const workspace = this.workspace.currentWorkspace();
    return user && workspace && !workspace.archived_at && this.store.canManage()
      ? JSON.stringify([user.id, workspace.id, this.params().get('draftId')])
      : null;
  });
  readonly workspaceId = computed(() => this.workspace.currentWorkspace()?.id ?? null);
  readonly draft = signal<VintedListingDraft | null>(null);
  /** Über die Entwurfsliste geöffnet; „Inserat erstellen“ behält seinen Titel auch nach dem Speichern. */
  readonly openedSavedDraft = computed(() => this.params().get('draftId') !== null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly imageEditing = signal(false);
  readonly dirty = signal(false);
  readonly error = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly conflict = signal(false);
  readonly progress = signal('');
  readonly images = signal<readonly ListingImageDraft[]>([]);
  readonly categories = signal<readonly VintedCategory[]>([]);
  readonly categoryError = signal<string | null>(null);
  readonly brandSelectionContext = signal<string | null>(null);
  readonly publication = signal<{
    readonly scopeKey: string;
    readonly userId: string;
    readonly draft: VintedListingDraft;
    readonly account: MarketplaceConnection;
    readonly images: readonly ListingImageDraft[];
  } | null>(null);
  readonly publicationAnnouncement = signal('');
  readonly jobRefresh = signal(0);
  readonly fieldSelection = signal<{
    readonly scopeKey: string;
    readonly connectionId: string;
    readonly categoryId: number;
    readonly content: VintedListingContent;
  } | null>(null);
  private readonly selectedFields = signal<VintedListingFieldSelection | null>(null);
  private readonly selectedBrand = signal<
    (VintedListingBrandSelection & { categoryId: number | null }) | null
  >(null);
  private readonly referenceContent = signal(emptyVintedListingContent());
  private readonly changed = signal(0);
  private loadedContext: string | null = null;
  private generation = 0;
  private activeSave: Promise<void> | null = null;
  private requestId = crypto.randomUUID();
  readonly validateImage = vintedDraftImageError;
  readonly form = new FormGroup({
    title: new FormControl('', textOptions),
    description: new FormControl('', textOptions),
    price: new FormControl('', textOptions),
    categoryId: new FormControl<string | null>(null),
    brand: new FormControl('', textOptions),
    size: new FormControl('', textOptions),
    condition: new FormControl('', textOptions),
    colors: new FormControl('', textOptions),
    materials: new FormControl('', textOptions),
    connectionId: new FormControl<string | null>(null),
  });
  readonly accountOptions = computed(() => [
    { value: null, label: 'Noch kein Konto auswählen' },
    ...this.store
      .connections()
      .map((account) => ({ value: account.connectionId, label: account.displayName })),
  ]);
  readonly categorySource = computed(() => {
    try {
      return this.categories().length ? vintedCategorySource(this.categories()) : null;
    } catch {
      return null;
    }
  });
  readonly priceError = computed(() => {
    this.changed();
    try {
      parseVintedListingPrice(this.form.controls.price.value);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Ungültiger Verkaufspreis.';
    }
  });
  readonly content = computed(() => {
    this.changed();
    try {
      return this.contentSnapshot();
    } catch {
      return this.referenceContent();
    }
  });
  readonly contentError = computed(() => {
    this.changed();
    try {
      this.contentSnapshot();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Eine Artikelangabe ist ungültig.';
    }
  });
  readonly missingVariables = computed(() => missingVintedListingVariables(this.content()));
  readonly status = computed(() =>
    this.saving()
      ? this.progress() || 'Entwurf wird gespeichert …'
      : this.conflict()
        ? 'Versionskonflikt'
        : this.dirty()
          ? 'Änderungen noch nicht gespeichert'
          : this.draft()
            ? 'In Flipbase gespeichert'
            : 'Noch kein Entwurf angelegt',
  );
  readonly canSave = computed(
    () =>
      this.store.canManage() &&
      !this.loading() &&
      !this.loadError() &&
      !this.saving() &&
      !this.imageEditing() &&
      !this.conflict() &&
      !this.contentError() &&
      this.dirty(),
  );
  readonly canSelectBrand = computed(
    () =>
      this.store.canManage() &&
      !!this.context() &&
      this.context() === this.loadedContext &&
      !this.loading() &&
      !this.loadError() &&
      !this.saving() &&
      !this.imageEditing() &&
      !this.conflict(),
  );
  private readonly fieldSelectionScope = computed(() => {
    this.changed();
    const connectionId = this.form.controls.connectionId.value;
    const account = this.store.connections().find((value) => value.connectionId === connectionId);
    return JSON.stringify([
      this.context(),
      connectionId,
      account?.externalAccountId,
      account?.workspaceId,
      account?.status,
      account?.executionMode,
      this.currentCategoryId(),
    ]);
  });
  readonly canSelectFields = computed(() => {
    this.changed();
    const account = this.store
      .connections()
      .find((value) => value.connectionId === this.form.controls.connectionId.value);
    return (
      this.canSelectBrand() &&
      !this.contentError() &&
      this.currentCategoryId() !== null &&
      !!account &&
      account.workspaceId === this.workspaceId() &&
      account.status === 'connected' &&
      account.executionMode === 'cloud' &&
      /^[1-9][0-9]{0,31}$/.test(account.externalAccountId ?? '')
    );
  });
  readonly canPreparePublication = computed(() => {
    const draft = this.draft();
    const account = this.store
      .connections()
      .find((value) => value.connectionId === draft?.connectionId);
    return (
      this.canSelectFields() &&
      !this.dirty() &&
      !!draft &&
      draft.workspaceId === this.workspaceId() &&
      draft.connectionId === this.form.controls.connectionId.value &&
      account?.marketplace === 'vinted'
    );
  });
  readonly canStartPublication = computed(
    () => this.canPreparePublication() || (this.canSelectFields() && this.canSave()),
  );
  private readonly publicationScope = computed(() =>
    JSON.stringify([
      this.fieldSelectionScope(),
      this.draft()?.id,
      this.draft()?.revision,
      this.changed(),
    ]),
  );
  readonly packageLabel = computed(() => {
    const content = this.content();
    if (content.packageSizeId === null) return 'Noch nicht festgelegt';
    const selection = this.selectedFields();
    return selection?.categoryId === content.categoryId &&
      selection.fields.includes('package') &&
      selection.values.packageSizeId === content.packageSizeId
      ? selection.packageLabel
      : 'Bereits festgelegt';
  });

  constructor() {
    effect(() => {
      const context = this.context();
      untracked(() => void this.load(context));
    });
    effect(() => {
      const scope = this.fieldSelectionScope();
      const selection = this.fieldSelection();
      if (selection && selection.scopeKey !== scope) untracked(() => this.closeFieldSelection());
    });
    effect(() => {
      const opened = this.publication();
      if (opened && (!this.canPreparePublication() || opened.scopeKey !== this.publicationScope()))
        untracked(() => this.closePublication());
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.markChanged());
    this.destroyRef.onDestroy(() => {
      this.generation++;
    });
  }
  /** Ungespeicherte Eingaben werden zuerst als Entwurf gesichert; die Vorschau zeigt nur Gespeichertes. */
  async openPublication(): Promise<void> {
    if (this.dirty()) {
      if (!this.canStartPublication()) return;
      await this.save();
    }
    if (!this.canPreparePublication()) return;
    const draft = this.draft()!;
    const account = this.store
      .connections()
      .find((value) => value.connectionId === draft.connectionId)!;
    this.publicationAnnouncement.set('');
    this.publication.set({
      scopeKey: this.publicationScope(),
      userId: this.auth.currentUser()!.id,
      draft: structuredClone(draft),
      account: structuredClone(account),
      images: [...this.images()],
    });
  }
  closePublication(): void {
    this.publication.set(null);
  }
  publicationAccepted(job: VintedListingJob): void {
    const opened = this.publication();
    if (
      !opened ||
      !this.canPreparePublication() ||
      opened.scopeKey !== this.publicationScope() ||
      job.workspaceId !== opened.draft.workspaceId ||
      job.draftId !== opened.draft.id ||
      job.connectionId !== opened.draft.connectionId ||
      job.draftRevision !== opened.draft.revision ||
      job.action !== 'publish'
    )
      return;
    this.closePublication();
    this.publicationAnnouncement.set(
      'Die Veröffentlichung wurde beauftragt. Den bestätigten Vinted-Stand siehst Du im Auftragsverlauf.',
    );
    this.jobRefresh.update((value) => value + 1);
  }
  openBrandSelection(): void {
    if (this.canSelectBrand()) this.brandSelectionContext.set(this.context());
  }
  openFieldSelection(): void {
    if (!this.canSelectFields()) return;
    this.fieldSelection.set({
      scopeKey: this.fieldSelectionScope(),
      connectionId: this.form.controls.connectionId.value!,
      categoryId: this.currentCategoryId()!,
      content: this.contentSnapshot(),
    });
  }
  closeFieldSelection(): void {
    this.fieldSelection.set(null);
  }
  selectFields(selection: VintedListingFieldSelection): void {
    const opened = this.fieldSelection();
    if (!opened || !this.canSelectFields() || opened.scopeKey !== this.fieldSelectionScope())
      return;
    try {
      const content = applyVintedListingFieldSelection(this.contentSnapshot(), selection);
      if (selection.fields.includes('size'))
        this.form.controls.size.setValue(content.sizeLabel, { emitEvent: false });
      if (selection.fields.includes('condition'))
        this.form.controls.condition.setValue(content.conditionLabel, { emitEvent: false });
      if (selection.fields.includes('color'))
        this.form.controls.colors.setValue(content.colorLabels.join(', '), { emitEvent: false });
      if (selection.fields.includes('material'))
        this.form.controls.materials.setValue(content.materialLabels.join(', '), {
          emitEvent: false,
        });
      const previous = this.selectedFields();
      this.selectedFields.set({
        categoryId: selection.categoryId,
        fields: [
          ...new Set([
            ...(previous?.categoryId === selection.categoryId ? previous.fields : []),
            ...selection.fields,
          ]),
        ],
        values: {
          sizeId: content.sizeId,
          sizeLabel: content.sizeLabel,
          conditionId: content.conditionId,
          conditionLabel: content.conditionLabel,
          colorIds: content.colorIds,
          colorLabels: content.colorLabels,
          materialIds: content.materialIds,
          materialLabels: content.materialLabels,
          packageSizeId: content.packageSizeId,
        },
        packageLabel: selection.fields.includes('package')
          ? selection.packageLabel
          : (previous?.packageLabel ?? ''),
      });
      this.markChanged();
      this.closeFieldSelection();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Die Auswahl konnte nicht übernommen werden.',
      );
    }
  }
  closeBrandSelection(): void {
    this.brandSelectionContext.set(null);
  }
  selectBrand(selection: VintedListingBrandSelection): void {
    if (
      !this.canSelectBrand() ||
      !this.brandSelectionContext() ||
      this.brandSelectionContext() !== this.context() ||
      !validVintedListingBrand(selection)
    )
      return;
    this.form.controls.brand.setValue(selection.brandLabel, { emitEvent: false });
    this.selectedBrand.set({ ...selection, categoryId: this.currentCategoryId() });
    this.markChanged();
    this.closeBrandSelection();
  }
  changeImages(images: readonly ListingImageDraft[]): void {
    const previous = this.images();
    const changed =
      images.length !== previous.length ||
      images.some(
        (image, index) =>
          image.key !== previous[index]?.key ||
          image.file !== previous[index]?.file ||
          image.storagePath !== previous[index]?.storagePath,
      );
    this.images.set(images);
    if (changed) this.markChanged();
  }
  applyTemplate(content: VintedListingContent): void {
    this.referenceContent.set(content);
    this.patch(content, this.form.controls.connectionId.value);
    this.markChanged();
  }
  setImageEditing(editing: boolean): void {
    this.imageEditing.set(editing);
  }
  /** Speichert ausschließlich auf ausdrücklichen Wunsch; die geöffnete Seite bleibt bestehen. */
  async save(): Promise<void> {
    if (this.activeSave) return this.activeSave;
    if (
      !this.context() ||
      this.loading() ||
      this.loadError() ||
      this.conflict() ||
      this.imageEditing() ||
      !this.dirty()
    )
      return;
    const context = this.loadedContext;
    const generation = this.generation;
    const change = this.changed();
    this.saving.set(true);
    this.error.set(null);
    const task = this.persist(generation, change);
    this.activeSave = task;
    await task;
    if (this.activeSave === task) this.activeSave = null;
    if (!this.current(generation, context)) return;
    this.saving.set(false);
    this.progress.set('');
  }
  async reload(): Promise<void> {
    if (this.saving()) return;
    if (
      this.dirty() &&
      !(await this.dialog.frage({
        titel: 'Aktuellen Entwurf laden?',
        text: 'Deine noch nicht gespeicherten Eingaben werden durch den gespeicherten Stand ersetzt.',
        bestaetigenText: 'Stand laden',
      }))
    )
      return;
    const context = this.context();
    const id = this.draft()?.id ?? this.params().get('draftId');
    await this.load(context, true, id);
  }
  async canLeave(): Promise<boolean> {
    if (this.activeSave) await this.activeSave;
    return (
      (!this.dirty() && !this.imageEditing()) ||
      (await this.dialog.frage({
        titel: 'Entwurf verlassen?',
        text: 'Deine letzten Änderungen sind noch nicht gespeichert. Wenn Du die Seite verlässt, gehen diese Eingaben verloren.',
        bestaetigenText: 'Seite verlassen',
        abbrechenText: 'Weiter bearbeiten',
      }))
    );
  }
  async cancel(): Promise<void> {
    await this.router.navigate(['/marketplaces/vinted/listing-drafts']);
  }
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() || this.saving() || this.imageEditing()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  private markChanged(): void {
    if (!this.loading() && !this.loadError()) {
      const selection = this.selectedBrand();
      if (
        selection &&
        (selection.categoryId !== this.currentCategoryId() ||
          selection.brandLabel !== this.form.controls.brand.value)
      )
        this.selectedBrand.set(null);
      const fields = this.selectedFields();
      if (fields) {
        if (fields.categoryId !== this.currentCategoryId()) this.selectedFields.set(null);
        else
          this.selectedFields.set({
            ...fields,
            fields: fields.fields.filter((field) => {
              switch (field) {
                case 'size':
                  return fields.values.sizeLabel === this.form.controls.size.value;
                case 'condition':
                  return fields.values.conditionLabel === this.form.controls.condition.value;
                case 'color':
                  return same(fields.values.colorLabels, labels(this.form.controls.colors.value));
                case 'material':
                  return same(
                    fields.values.materialLabels,
                    labels(this.form.controls.materials.value),
                  );
                case 'package':
                  return true;
              }
            }),
          });
      }
      this.changed.update((value) => value + 1);
      this.dirty.set(true);
    }
  }
  private current(generation: number, context = this.loadedContext): boolean {
    return (
      !this.destroyRef.destroyed &&
      generation === this.generation &&
      context !== null &&
      context === this.context()
    );
  }
  private async load(
    context: string | null,
    force = false,
    idOverride: string | null = null,
  ): Promise<void> {
    if (!force && context === this.loadedContext) return;
    this.loadedContext = context;
    this.closeBrandSelection();
    this.closeFieldSelection();
    this.closePublication();
    this.publicationAnnouncement.set('');
    const generation = ++this.generation;
    this.activeSave = null;
    this.loading.set(true);
    this.imageEditing.set(false);
    this.draft.set(null);
    this.images.set([]);
    this.categories.set([]);
    this.error.set(null);
    this.loadError.set(null);
    this.categoryError.set(null);
    this.conflict.set(false);
    this.dirty.set(false);
    this.saving.set(false);
    this.referenceContent.set(emptyVintedListingContent());
    this.patch(emptyVintedListingContent(), null);
    this.requestId = crypto.randomUUID();
    if (!context) {
      this.loading.set(false);
      return;
    }
    const workspaceId = this.workspaceId()!;
    const id = idOverride ?? this.params().get('draftId');
    try {
      if (id) {
        const draft = await this.api.load(workspaceId, id);
        if (!this.current(generation, context)) return;
        const images = await this.imageApi.previews(draft);
        if (!this.current(generation, context)) return;
        this.draft.set(draft);
        this.referenceContent.set(draft.content);
        this.patch(draft.content, draft.connectionId);
        this.images.set(images);
      } else
        this.form.controls.connectionId.setValue(
          this.store.selectedConnection()?.connectionId ?? null,
          { emitEvent: false },
        );
    } catch (error) {
      if (this.current(generation, context))
        this.loadError.set(
          error instanceof Error ? error.message : 'Der Entwurf konnte nicht geladen werden.',
        );
    }
    if (!this.current(generation, context)) return;
    this.loading.set(false);
    try {
      const snapshot = await this.categoryApi.readSnapshot();
      if (this.current(generation, context)) this.categories.set(snapshot.categories);
    } catch {
      if (this.current(generation, context))
        this.categoryError.set(
          'Die Vinted-Kategorien konnten nicht geladen werden. Deine Eingaben bleiben erhalten.',
        );
    }
  }
  private async persist(generation: number, change: number): Promise<void> {
    const context = this.loadedContext;
    const workspaceId = this.workspaceId()!;
    try {
      if (this.form.invalid)
        throw new Error('Eine Eingabe ist zu lang. Kürze sie vor dem Speichern.');
      const content = this.contentSnapshot();
      const connectionId = this.form.controls.connectionId.value;
      const selection = [...this.images()];
      let draft = this.draft();
      draft = draft
        ? await this.api.save(draft, content, connectionId)
        : await this.api.create(workspaceId, content, connectionId, this.requestId);
      if (!this.current(generation, context)) return;
      this.draft.set(draft);
      // Wiederholte Neuanlage liefert den bereits vorhandenen Stand; neue Eingaben benötigen eine neue Revision.
      if (!same(draft.content, content) || draft.connectionId !== connectionId) {
        draft = await this.api.save(draft, content, connectionId);
        if (!this.current(generation, context)) return;
        this.draft.set(draft);
      }
      const ids: string[] = [];
      let replaceIds = draft.images
        .filter((stored) => !selection.some((image) => image.key === stored.id && !image.file))
        .map((image) => image.id);
      for (const [index, image] of selection.entries()) {
        let id = image.key;
        if (image.file) {
          this.progress.set(`Foto ${index + 1} von ${selection.length} wird hochgeladen …`);
          const oldIds = new Set(draft.images.map((entry) => entry.id));
          const replaceId = replaceIds.includes(image.key) ? image.key : replaceIds[0];
          draft = await this.imageApi.upload(draft, image.file, replaceId);
          if (!this.current(generation, context)) return;
          replaceIds = replaceIds.filter((id) => id !== replaceId);
          const added = draft.images.find((entry) => !oldIds.has(entry.id));
          if (!added)
            throw new Error(
              'Das hochgeladene Foto konnte nicht zugeordnet werden. Lade den Entwurf erneut.',
            );
          id = added.id;
          this.draft.set(draft);
          this.images.update((images) =>
            images.map((entry) =>
              entry.key === image.key && entry.file === image.file
                ? { ...entry, key: added.id, file: null, storagePath: added.storagePath }
                : entry,
            ),
          );
        }
        ids.push(id);
      }
      if (
        !same(
          draft.images.map((image) => image.id),
          ids,
        )
      ) {
        draft = await this.imageApi.setOrder(draft, ids);
        if (!this.current(generation, context)) return;
        this.draft.set(draft);
      }
      this.referenceContent.set(content);
      this.dirty.set(change !== this.changed());
    } catch (error) {
      if (!this.current(generation, context)) return;
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Der Entwurf konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten.',
      );
      if (error instanceof VintedListingStorageError && error.code === 'conflict')
        this.conflict.set(true);
    }
  }
  private contentSnapshot(): VintedListingContent {
    const values = this.form.getRawValue();
    const previous = this.referenceContent();
    const categoryId = values.categoryId === null ? null : Number(values.categoryId);
    const categorySame = categoryId === previous.categoryId;
    const selectedBrand = this.selectedBrand();
    const colorLabels = labels(values.colors),
      materialLabels = labels(values.materials);
    const content = parseVintedListingContent({
      ...previous,
      title: values.title,
      description: values.description,
      priceCents: parseVintedListingPrice(values.price),
      categoryId,
      categoryLabel:
        this.categories().find((category) => category.id === categoryId)?.path ??
        (categorySame ? previous.categoryLabel : ''),
      brandLabel: values.brand,
      brandId:
        selectedBrand &&
        selectedBrand.categoryId === categoryId &&
        selectedBrand.brandLabel === values.brand
          ? selectedBrand.brandId
          : categorySame && values.brand === previous.brandLabel
            ? previous.brandId
            : null,
      sizeLabel: values.size,
      sizeId: categorySame && values.size === previous.sizeLabel ? previous.sizeId : null,
      conditionLabel: values.condition,
      conditionId:
        categorySame && values.condition === previous.conditionLabel ? previous.conditionId : null,
      colorLabels,
      colorIds: categorySame && same(colorLabels, previous.colorLabels) ? previous.colorIds : [],
      materialLabels,
      materialIds:
        categorySame && same(materialLabels, previous.materialLabels) ? previous.materialIds : [],
      packageSizeId: categorySame ? previous.packageSizeId : null,
      attributes: categorySame ? previous.attributes : {},
    });
    const fields = this.selectedFields();
    return fields?.categoryId === categoryId
      ? applyVintedListingFieldSelection(content, fields)
      : content;
  }
  private patch(content: VintedListingContent, connectionId: string | null): void {
    this.selectedBrand.set(null);
    this.selectedFields.set(null);
    this.form.reset(
      {
        title: content.title,
        description: content.description,
        price:
          content.priceCents === null
            ? ''
            : (content.priceCents / 100).toFixed(2).replace('.', ','),
        categoryId: content.categoryId === null ? null : String(content.categoryId),
        brand: content.brandLabel,
        size: content.sizeLabel,
        condition: content.conditionLabel,
        colors: content.colorLabels.join(', '),
        materials: content.materialLabels.join(', '),
        connectionId,
      },
      { emitEvent: false },
    );
    this.changed.update((value) => value + 1);
  }
  private currentCategoryId(): number | null {
    const value = this.form.controls.categoryId.value;
    return value === null ? null : Number(value);
  }
}
