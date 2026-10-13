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
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { LucideExternalLink, LucideRefreshCw, LucideSave } from '@lucide/angular';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { ProductMediaEditorComponent } from '../../../../shared/components/product-media-editor/product-media-editor.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { imageFileError } from '../../../../shared/components/image-cropper-modal/image-file';
import type { ProductImageDraft } from '../../../../core/models/product-media.models';
import type {
  EbayConnection,
  EbayListingDetails,
  EbayListingUpdate,
} from '../../../../../../supabase/functions/_shared/ebay-contracts';
import {
  EbayAccountApiService,
  EbayAccountRequestError,
} from '../../services/ebay-account-api.service';

@Component({
  selector: 'app-ebay-listing-editor',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    CardComponent,
    PageHeaderComponent,
    TextFieldComponent,
    NumberInputComponent,
    ProductMediaEditorComponent,
  ],
  templateUrl: './ebay-listing-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0', '(window:beforeunload)': 'beforeUnload($event)' },
})
export class EbayListingEditorComponent {
  private readonly api = inject(EbayAccountApiService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(ConfirmDialogService);
  private revision = 0;
  private readonly routeParameters = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly queryParameters = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly listingId = computed(() => this.routeParameters().get('listingId') ?? '');
  private readonly connectionId = computed(() => this.queryParameters().get('connection'));
  readonly listing = signal<EbayListingDetails | null>(null);
  readonly connection = signal<EbayConnection | null>(null);
  readonly images = signal<readonly ProductImageDraft[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmation = signal<string | null>(null);
  readonly mustReload = signal(false);
  readonly saveIcon = LucideSave;
  readonly refreshIcon = LucideRefreshCw;
  readonly externalIcon = LucideExternalLink;
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    price: new FormControl<number | null>(null, [Validators.min(0.01), Validators.max(1000000)]),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(20000)],
    }),
  });
  private readonly formValues = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  readonly dirty = computed(() => {
    this.formValues();
    const listing = this.listing();
    if (!listing) return false;
    const fields = this.form.getRawValue();
    return (
      fields.title !== listing.title ||
      fields.price !== listing.price ||
      fields.description !== listing.description ||
      this.images().some((image) => image.file !== null) ||
      JSON.stringify(this.images().map((image) => image.previewUrl)) !==
        JSON.stringify(listing.imageUrls)
    );
  });
  readonly validateImage = (file: File): string | null =>
    imageFileError(file) ??
    (file.size > 12 * 1024 * 1024 ? 'Ein eBay-Bild darf höchstens 12 MB groß sein.' : null);

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      const workspace = this.workspace.currentWorkspace();
      this.listingId();
      this.connectionId();
      untracked(() => {
        const revision = ++this.revision;
        this.clear();
        if (user && workspace && !workspace.archived_at) void this.load(workspace.id, revision);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.revision++;
    });
  }
  private clear(): void {
    this.listing.set(null);
    this.connection.set(null);
    this.images.set([]);
    this.loading.set(false);
    this.saving.set(false);
    this.error.set(null);
    this.confirmation.set(null);
    this.mustReload.set(false);
    this.form.reset({ title: '', price: null, description: '' });
  }
  private applyListing(listing: EbayListingDetails): void {
    this.listing.set(listing);
    this.form.reset({
      title: listing.title,
      price: listing.price,
      description: listing.description,
    });
    if (listing.hasVariations) this.form.controls.price.disable();
    else this.form.controls.price.enable();
    this.images.set(
      listing.imageUrls.map((url, index) => ({
        key: `${listing.id}-${index}`,
        media: null,
        file: null,
        previewUrl: url,
      })),
    );
    this.mustReload.set(false);
  }
  private async load(workspaceId: string, revision: number): Promise<void> {
    this.loading.set(true);
    try {
      const status = await this.api.loadStatus(workspaceId);
      if (revision !== this.revision) return;
      if (
        !status.listingManagementAvailable ||
        status.connection?.status !== 'connected' ||
        status.connection.connectionId !== this.connectionId()
      )
        throw new Error(
          'Verbinde das zugehörige eBay-Konto in diesem Workspace und öffne das Inserat erneut.',
        );
      const listing = await this.api.loadListingDetails(status.connection, this.listingId());
      if (revision !== this.revision) return;
      this.connection.set(status.connection);
      this.applyListing(listing);
    } catch (error) {
      if (revision === this.revision)
        this.error.set(
          error instanceof Error ? error.message : 'Das eBay-Inserat konnte nicht geladen werden.',
        );
    } finally {
      if (revision === this.revision) this.loading.set(false);
    }
  }
  async reload(): Promise<void> {
    if (this.saving() || this.loading() || !(await this.canLeave())) return;
    const workspace = this.workspace.currentWorkspace();
    if (!this.auth.currentUser() || !workspace || workspace.archived_at) return;
    const revision = ++this.revision;
    this.clear();
    await this.load(workspace.id, revision);
  }
  async canLeave(): Promise<boolean> {
    if (this.saving()) return false;
    if (!this.dirty()) return true;
    return this.dialog.frage({
      titel: 'Änderungen verwerfen?',
      text: 'Deine noch nicht gespeicherten Änderungen am eBay-Inserat gehen verloren.',
      bestaetigenText: 'Verwerfen',
      abbrechenText: 'Weiter bearbeiten',
    });
  }
  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.dirty() && !this.saving()) return;
    event.preventDefault();
    event.returnValue = '';
  }
  async save(): Promise<void> {
    const listing = this.listing(),
      connection = this.connection();
    if (
      !listing ||
      !connection ||
      this.saving() ||
      this.loading() ||
      this.mustReload() ||
      !this.dirty()
    )
      return;
    this.form.markAllAsTouched();
    const fields = this.form.getRawValue();
    if (
      this.form.invalid ||
      !fields.title.trim() ||
      !fields.description.trim() ||
      (fields.price !== listing.price && fields.price === null) ||
      this.images().length < 1 ||
      this.images().length > 24 ||
      this.images().some((image) => image.file && this.validateImage(image.file))
    ) {
      this.error.set(
        'Prüfe Titel, Beschreibung, Preis und Bilder. Mindestens ein Bild ist erforderlich.',
      );
      return;
    }
    const revision = this.revision;
    this.saving.set(true);
    this.error.set(null);
    this.confirmation.set(null);
    let submitted = false;
    try {
      const imageUrls: string[] = [];
      for (const image of this.images()) {
        const url = image.file
          ? await this.api.uploadListingImage(connection, listing.id, image.file)
          : image.previewUrl;
        if (revision !== this.revision) return;
        imageUrls.push(url);
        if (image.file)
          this.images.update((images) =>
            images.map((current) =>
              current.key === image.key ? { ...current, file: null, previewUrl: url } : current,
            ),
          );
      }
      const update: EbayListingUpdate = {
        expectedRevision: listing.revision,
        ...(fields.title !== listing.title ? { title: fields.title } : {}),
        ...(fields.price !== listing.price && fields.price !== null ? { price: fields.price } : {}),
        ...(fields.description !== listing.description ? { description: fields.description } : {}),
        ...(JSON.stringify(imageUrls) !== JSON.stringify(listing.imageUrls) ? { imageUrls } : {}),
      };
      if (revision !== this.revision) return;
      submitted = true;
      const warning = await this.api.updateListing(connection, listing.id, update);
      if (revision !== this.revision) return;
      this.confirmation.set(warning ?? 'Deine Änderungen wurden bei eBay gespeichert.');
      this.mustReload.set(true);
      // Die bestätigte Übertragung bleibt getrennt vom anschließenden Leseabruf.
      const current = await this.api.loadListingDetails(connection, listing.id);
      if (revision === this.revision) this.applyListing(current);
    } catch (error) {
      if (revision !== this.revision) return;
      if (
        submitted &&
        (!(error instanceof EbayAccountRequestError) ||
          ![
            'revision_rejected',
            'invalid_request',
            'listing_not_editable',
            'listing_not_owned',
            'scope_missing',
            'needs_login',
          ].includes(error.code ?? ''))
      )
        this.mustReload.set(true);
      this.error.set(
        error instanceof Error
          ? error.message
          : 'Die Änderung wurde nicht bestätigt. Lade das Inserat erneut.',
      );
    } finally {
      if (revision === this.revision) this.saving.set(false);
    }
  }
}
