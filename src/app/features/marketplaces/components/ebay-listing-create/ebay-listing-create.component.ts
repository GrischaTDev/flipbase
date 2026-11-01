import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideCheck, LucideExternalLink, LucideSearch, LucideSend } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ProductMediaEditorComponent } from '../../../../shared/components/product-media-editor/product-media-editor.component';
import type { ProductImageDraft } from '../../../../core/models/product-media.models';
import { imageFileError } from '../../../../shared/components/image-cropper-modal/image-file';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import {
  EbayAccountApiService,
  EbayAccountRequestError,
} from '../../services/ebay-account-api.service';
import type { AccountScope } from '../../models/marketplace.models';
import type {
  EbayCategoryDetails,
  EbayListingCheck,
  EbayListingDraft,
  EbayListingSettings,
} from '../../../../../../supabase/functions/_shared/ebay-listing-creation-contracts';

interface AspectField {
  readonly name: string;
  readonly required: boolean;
  readonly selectionOnly: boolean;
  readonly multiple: boolean;
  readonly options: readonly SelectOption<string>[];
  readonly control: FormControl<string>;
}
type Review = EbayListingCheck & { readonly reviewHash: string; readonly draft: EbayListingDraft };
@Component({
  selector: 'app-ebay-listing-create',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    ButtonComponent,
    CardComponent,
    PageHeaderComponent,
    TextFieldComponent,
    NumberInputComponent,
    CustomSelectComponent,
    ProductMediaEditorComponent,
  ],
  templateUrl: './ebay-listing-create.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0', '(window:beforeunload)': 'beforeUnload($event)' },
})
export class EbayListingCreateComponent {
  private readonly api = inject(EbayAccountApiService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly dialog = inject(ConfirmDialogService);
  private scope: AccountScope | null = null;
  private workspaceContextKey: string | null | undefined;
  private revision = 0;
  private categoryRevision = 0;
  private key = crypto.randomUUID().replaceAll('-', '');
  private storageKey = '';
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly categoryLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly settings = signal<EbayListingSettings | null>(null);
  readonly categories = signal<readonly SelectOption<string>[]>([]);
  readonly categoryId = signal<string | null>(null);
  readonly conditions = signal<readonly SelectOption<string>[]>([]);
  readonly aspects = signal<readonly AspectField[]>([]);
  readonly images = signal<readonly ProductImageDraft[]>([]);
  readonly review = signal<Review | null>(null);
  readonly pending = signal(false);
  readonly createdId = signal<string | null>(null);
  readonly sandbox = signal(false);
  readonly search = new FormControl('', { nonNullable: true });
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(20000)],
    }),
    price: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(1000000),
    ]),
    quantity: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(1000)],
    }),
    condition: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    postalCode: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d{5}$/)],
    }),
    location: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    payment: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    fulfillment: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    returns: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly checkIcon = LucideCheck;
  readonly sendIcon = LucideSend;
  readonly searchIcon = LucideSearch;
  readonly externalIcon = LucideExternalLink;
  readonly validateImage = (file: File) =>
    imageFileError(file) ??
    (file.size > 12 * 1024 * 1024 ? 'Ein Bild darf höchstens 12 MB groß sein.' : null);
  constructor() {
    effect(() => {
      const user = this.auth.currentUser(),
        workspace = this.workspace.currentWorkspace();
      const contextKey =
        user && workspace && !workspace.archived_at
          ? JSON.stringify([user.id, workspace.id])
          : null;
      untracked(() => {
        if (contextKey === this.workspaceContextKey) return;
        this.workspaceContextKey = contextKey;
        const revision = ++this.revision;
        this.scope = null;
        this.form.reset();
        this.form.enable({ emitEvent: false });
        this.search.reset();
        this.releaseImages();
        this.images.set([]);
        this.review.set(null);
        this.pending.set(false);
        this.createdId.set(null);
        this.settings.set(null);
        this.categoryId.set(null);
        this.categories.set([]);
        this.aspects.set([]);
        this.conditions.set([]);
        this.error.set(null);
        this.busy.set(false);
        this.loading.set(false);
        this.categoryLoading.set(false);
        this.key = crypto.randomUUID().replaceAll('-', '');
        if (user && workspace && !workspace.archived_at)
          void this.load(user.id, workspace.id, revision);
      });
    });
    effect(() => {
      const locked = this.busy() || !!this.review();
      const searchLocked = locked || this.categoryLoading();
      const aspects = this.aspects();
      untracked(() => {
        if (locked) this.form.disable({ emitEvent: false });
        else this.form.enable({ emitEvent: false });
        if (searchLocked) this.search.disable({ emitEvent: false });
        else this.search.enable({ emitEvent: false });
        for (const aspect of aspects) {
          if (locked) aspect.control.disable({ emitEvent: false });
          else aspect.control.enable({ emitEvent: false });
        }
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.revision++;
      this.releaseImages();
    });
  }
  private releaseImages(): void {
    for (const image of this.images())
      if (image.previewUrl.startsWith('blob:')) URL.revokeObjectURL(image.previewUrl);
  }
  private async load(userId: string, workspaceId: string, revision: number): Promise<void> {
    this.loading.set(true);
    try {
      const status = await this.api.loadStatus(workspaceId);
      if (revision !== this.revision) return;
      if (status.connection?.status !== 'connected')
        throw new Error('Verbinde Dein eBay-Konto, bevor Du ein Inserat erstellst.');
      if (status.listingCreationAvailable !== true)
        throw new Error('Die Inseraterstellung ist auf dem Server noch nicht verfügbar.');
      this.scope = { workspaceId, connectionId: status.connection.connectionId };
      this.sandbox.set(status.connection.environment === 'sandbox');
      this.storageKey = `flipbase.ebay.pending-listing:${userId}:${workspaceId}:${status.connection.connectionId}`;
      const previous = sessionStorage.getItem(this.storageKey);
      if (previous && /^[a-f0-9]{32}$/.test(previous)) {
        this.key = previous;
        this.pending.set(true);
        return;
      }
      const settings = await this.api.loadListingSettings(this.scope);
      if (revision === this.revision) this.settings.set(settings);
    } catch (error) {
      if (revision === this.revision) this.error.set(this.failure(error));
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
  private failure(error: unknown): string {
    return error instanceof Error ? error.message : 'eBay ist gerade nicht erreichbar.';
  }
  options(
    values: readonly { readonly id: string; readonly name: string }[],
  ): readonly SelectOption<string>[] {
    return values.map((value) => ({ value: value.id, label: value.name }));
  }
  async searchCategories(): Promise<void> {
    if (!this.scope || this.categoryLoading() || this.busy() || this.search.value.trim().length < 2)
      return;
    const revision = this.revision;
    this.categoryLoading.set(true);
    this.error.set(null);
    try {
      const categories = await this.api.searchCategories(this.scope, this.search.value);
      if (revision === this.revision) this.categories.set(this.options(categories));
    } catch (error) {
      if (revision === this.revision) this.error.set(this.failure(error));
    } finally {
      if (revision === this.revision) this.categoryLoading.set(false);
    }
  }
  async selectCategory(id: string | null): Promise<void> {
    if (!this.scope || this.busy() || this.pending()) return;
    const revision = this.revision,
      categoryRevision = ++this.categoryRevision;
    this.categoryId.set(id);
    this.conditions.set([]);
    this.aspects.set([]);
    this.form.controls.condition.reset();
    this.review.set(null);
    if (!id) return;
    this.categoryLoading.set(true);
    try {
      const details: EbayCategoryDetails = await this.api.loadCategoryDetails(this.scope, id);
      if (revision !== this.revision || categoryRevision !== this.categoryRevision) return;
      this.conditions.set(this.options(details.conditions));
      this.aspects.set(
        details.aspects.map((aspect) => ({
          ...aspect,
          options: aspect.values.map((value) => ({ value, label: value })),
          control: new FormControl('', {
            nonNullable: true,
            validators: aspect.required ? [Validators.required] : [],
          }),
        })),
      );
    } catch (error) {
      if (revision === this.revision && categoryRevision === this.categoryRevision)
        this.error.set(this.failure(error));
    } finally {
      if (revision === this.revision && categoryRevision === this.categoryRevision)
        this.categoryLoading.set(false);
    }
  }
  async check(): Promise<void> {
    const scope = this.scope;
    if (!scope || this.busy() || this.pending() || this.createdId() || this.categoryLoading())
      return;
    this.form.markAllAsTouched();
    this.aspects().forEach((aspect) => aspect.control.markAsTouched());
    if (
      this.form.invalid ||
      !this.categoryId() ||
      !this.conditions().length ||
      !this.images().length ||
      this.aspects().some((aspect) => aspect.control.invalid)
    ) {
      this.error.set('Ergänze die Pflichtfelder, Kategorie, Merkmale und mindestens ein Bild.');
      return;
    }
    const revision = this.revision;
    this.busy.set(true);
    this.error.set(null);
    this.review.set(null);
    try {
      const imageUrls: string[] = [];
      for (const image of this.images()) {
        const url = image.file
          ? await this.api.uploadDraftImage(scope, image.file)
          : image.previewUrl;
        if (revision !== this.revision) return;
        imageUrls.push(url);
      }
      this.images.update((images) =>
        images.map((image, index) => {
          if (image.previewUrl.startsWith('blob:')) URL.revokeObjectURL(image.previewUrl);
          return { ...image, file: null, previewUrl: imageUrls[index]! };
        }),
      );
      const fields = this.form.getRawValue();
      const draft: EbayListingDraft = {
        key: this.key,
        title: fields.title,
        description: fields.description,
        price: fields.price!,
        quantity: fields.quantity,
        categoryId: this.categoryId()!,
        conditionId: fields.condition,
        postalCode: fields.postalCode,
        location: fields.location,
        paymentPolicyId: fields.payment,
        fulfillmentPolicyId: fields.fulfillment,
        returnPolicyId: fields.returns,
        imageUrls,
        aspects: this.aspects()
          .filter((aspect) => aspect.control.value.trim())
          .map((aspect) => ({
            name: aspect.name,
            values: (aspect.multiple ? aspect.control.value.split(';') : [aspect.control.value])
              .map((value) => value.trim())
              .filter(Boolean),
          })),
      };
      const result = await this.api.checkNewListing(scope, draft);
      if (revision !== this.revision) return;
      this.review.set({ ...result, draft });
      this.form.disable({ emitEvent: false });
      this.aspects().forEach((aspect) => aspect.control.disable({ emitEvent: false }));
    } catch (error) {
      if (revision === this.revision) this.error.set(this.failure(error));
    } finally {
      if (revision === this.revision) this.busy.set(false);
    }
  }
  edit(): void {
    if (this.busy() || this.pending() || this.createdId()) return;
    this.review.set(null);
    this.form.enable();
    this.aspects().forEach((aspect) => aspect.control.enable());
  }
  async publish(): Promise<void> {
    const scope = this.scope,
      review = this.review();
    if (!scope || !review?.valid || this.busy() || this.pending() || this.createdId()) return;
    const revision = this.revision;
    const confirmed = await this.dialog.frage({
      titel: this.sandbox() ? 'Testinserat veröffentlichen?' : 'Inserat bei eBay veröffentlichen?',
      text: `„${review.draft.title}“ wird mit ${review.draft.quantity} Stück zu je ${review.draft.price.toFixed(2)} EUR veröffentlicht. Die angezeigten eBay-Gebühren und Kontorichtlinien gelten.`,
      bestaetigenText: 'Jetzt veröffentlichen',
      abbrechenText: 'Zurück',
    });
    if (!confirmed || revision !== this.revision || this.busy()) return;
    const storageKey = this.storageKey;
    try {
      sessionStorage.setItem(storageKey, this.key);
    } catch {
      this.error.set(
        'Der Browser kann den Veröffentlichungsstatus nicht sichern. Veröffentliche bitte direkt bei eBay.',
      );
      return;
    }
    this.pending.set(true);
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.api.checkNewListing(scope, review.draft, review.reviewHash);
      if (!result.valid) {
        sessionStorage.removeItem(storageKey);
        if (revision === this.revision) {
          this.pending.set(false);
          this.review.set({ ...result, draft: review.draft });
        }
        return;
      }
      if (!result.listingId)
        throw new EbayAccountRequestError(
          'save_unconfirmed',
          'Die Veröffentlichung ist noch nicht eindeutig bestätigt.',
        );
      sessionStorage.removeItem(storageKey);
      if (revision === this.revision) {
        this.createdId.set(result.listingId);
        this.pending.set(false);
      }
    } catch (error) {
      const safe =
        error instanceof EbayAccountRequestError &&
        [
          'invalid_request',
          'listing_review_changed',
          'needs_login',
          'scope_missing',
          'forbidden',
          'unauthorized',
          'connection_busy_or_unavailable',
        ].includes(error.code ?? '');
      if (safe) sessionStorage.removeItem(storageKey);
      if (revision === this.revision) {
        this.pending.set(!safe);
        this.error.set(this.failure(error));
        if (error instanceof EbayAccountRequestError && error.code === 'listing_review_changed') {
          this.review.set(null);
          this.form.enable();
          this.aspects().forEach((aspect) => aspect.control.enable());
        }
      }
    } finally {
      if (revision === this.revision) this.busy.set(false);
    }
  }
  async checkPublication(): Promise<void> {
    if (!this.scope || this.busy()) return;
    const revision = this.revision;
    this.busy.set(true);
    this.error.set(null);
    try {
      const id = await this.api.findCreatedListing(this.scope, this.key);
      if (revision !== this.revision) return;
      if (id) {
        this.createdId.set(id);
        this.pending.set(false);
        sessionStorage.removeItem(this.storageKey);
      } else
        this.error.set(
          'eBay bestätigt noch kein aktives Inserat. Es wird nichts erneut veröffentlicht. Prüfe den Stand direkt bei eBay.',
        );
    } catch (error) {
      if (revision === this.revision) this.error.set(this.failure(error));
    } finally {
      if (revision === this.revision) this.busy.set(false);
    }
  }
  listingUrl(id: string): string {
    return `${this.sandbox() ? 'https://sandbox.ebay.com' : 'https://www.ebay.de'}/itm/${id}`;
  }
  async canLeave(): Promise<boolean> {
    return this.busy()
      ? false
      : this.createdId() ||
          this.pending() ||
          (!this.form.dirty && !this.images().length && !this.categoryId())
        ? true
        : this.dialog.frage({
            titel: 'Inserat verlassen?',
            text: 'Deine noch nicht veröffentlichten Eingaben werden verworfen.',
            bestaetigenText: 'Verlassen',
            abbrechenText: 'Weiter bearbeiten',
          });
  }
  beforeUnload(event: BeforeUnloadEvent): void {
    if (
      this.busy() ||
      ((this.form.dirty || this.images().length || this.categoryId()) &&
        !this.createdId() &&
        !this.pending())
    )
      event.preventDefault();
  }
}
