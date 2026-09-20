import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { EntryPageLayoutComponent } from '../../../../shared/components/entry-page-layout/entry-page-layout.component';
import { TwoColumnLayoutComponent } from '../../../../shared/components/two-column-layout/two-column-layout.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import {
  ListingStudioService,
  type ListingStyleTone,
} from '../../../../core/services/listing-studio.service';
import { ListingExtensionService } from '../../services/listing-extension.service';
import { ListingService } from '../../services/listing.service';
import type {
  ListingContent,
  ListingPriceType,
  ListingShippingType,
} from '../../models/listing.models';
import { ListingExtensionHelpComponent } from '../../components/listing-extension-help/listing-extension-help.component';

@Component({
  selector: 'app-listing-editor',
  imports: [
    ButtonComponent,
    CustomSelectComponent,
    EntryPageLayoutComponent,
    ListingExtensionHelpComponent,
    ReactiveFormsModule,
    TwoColumnLayoutComponent,
  ],
  templateUrl: './listing-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
})
export class ListingEditorComponent {
  readonly listingService = inject(ListingService);
  readonly extension = inject(ListingExtensionService);
  private readonly studio = inject(ListingStudioService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private baseline = '';
  readonly isSaving = signal(false);
  readonly helpOpen = signal(false);
  readonly listingId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  readonly isEdit = computed(() => this.listingId() !== null);
  readonly priceTypeOptions: readonly SelectOption<ListingPriceType>[] = [
    { value: 'FIXED', label: 'Festpreis' },
    { value: 'NEGOTIABLE', label: 'Verhandlungsbasis' },
  ];
  readonly shippingTypeOptions: readonly SelectOption<ListingShippingType>[] = [
    { value: 'pickup', label: 'Abholung' },
    { value: 'shipping', label: 'Versand' },
    { value: 'both', label: 'Beides' },
  ];
  readonly itemOptions = computed<readonly SelectOption<string>[]>(() =>
    this.listingService.items().map((item) => ({
      value: item.id,
      label: `${item.title} · ${item.status}`,
    })),
  );
  readonly form = new FormGroup({
    inventoryItemId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(65)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(4000)],
    }),
    price: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(99_999_999),
    ]),
    priceType: new FormControl<ListingPriceType>('FIXED', { nonNullable: true }),
    shippingType: new FormControl<ListingShippingType>('pickup', { nonNullable: true }),
    shippingPrice: new FormControl<number | null>(null, [Validators.min(0)]),
    postalCode: new FormControl('', [Validators.pattern(/^\d{5}$/)]),
    styleTone: new FormControl<ListingStyleTone>('dealer', { nonNullable: true }),
    includeNonSmoking: new FormControl(false, { nonNullable: true }),
    includeDisclaimer: new FormControl(true, { nonNullable: true }),
  });
  readonly selectedItem = computed(
    () =>
      this.listingService
        .items()
        .find((item) => item.id === this.form.controls.inventoryItemId.value) ?? null,
  );

  constructor() {
    this.extension.start();
    effect(() => {
      const id = this.listingId();
      if (!id) return;
      const row = this.listingService.getById(id);
      if (!row) return;
      this.form.patchValue({ inventoryItemId: row.item.id, ...row.listing.content });
      this.form.controls.inventoryItemId.disable({ emitEvent: false });
      this.storeBaseline();
    });
    this.form.controls.shippingType.valueChanges.subscribe((type) => {
      if (type === 'pickup') this.form.controls.shippingPrice.setValue(null);
    });
  }

  hasUnsavedChanges(): boolean {
    return this.baseline !== JSON.stringify(this.form.getRawValue());
  }
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  generate(): void {
    const item = this.selectedItem();
    const price = this.form.controls.price.value;
    if (!item || price === null) return;
    const generated = this.studio.generateKleinanzeigenListing(item as never, price, {
      includeDisclaimer: this.form.controls.includeDisclaimer.value,
      includeNonSmoking: this.form.controls.includeNonSmoking.value,
      styleTone: this.form.controls.styleTone.value,
    });
    this.form.patchValue({
      title: generated.title.slice(0, 65),
      description: generated.description,
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.isSaving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSaving.set(true);
    try {
      const content = this.content();
      const result = this.isEdit()
        ? await this.listingService.updateContent(this.listingId()!, content)
        : await this.listingService.prepare(this.form.controls.inventoryItemId.value, content);
      if (result.error) {
        this.toast.error('Inserat konnte nicht gespeichert werden.', result.error.message);
        return;
      }
      this.storeBaseline();
      if (this.isEdit()) {
        this.toast.success('Inserat gespeichert.');
        void this.router.navigate(['/listings']);
        return;
      }
      const row = result.data ? this.listingService.getById(result.data.id) : null;
      if (!this.extension.available() || !row) {
        this.helpOpen.set(true);
        this.toast.success('Inserat wurde vorbereitet.');
        return;
      }
      const payload = await this.listingService.buildExtensionPayload(row);
      this.extension.publish(payload.payload);
      this.toast.success(
        'Kleinanzeigen wurde geöffnet.',
        'Setze das Inserat nach dem Aufgeben auf Online.',
      );
      void this.router.navigate(['/listings']);
    } finally {
      this.isSaving.set(false);
    }
  }

  cancel(): void {
    void this.router.navigate(['/listings']);
  }
  private content(): ListingContent {
    return {
      title: this.form.controls.title.value,
      description: this.form.controls.description.value,
      price: this.form.controls.price.value ?? 0,
      priceType: this.form.controls.priceType.value,
      shippingType: this.form.controls.shippingType.value,
      shippingPrice: this.form.controls.shippingPrice.value,
      postalCode: this.form.controls.postalCode.value?.trim() || null,
    };
  }
  private storeBaseline(): void {
    this.baseline = JSON.stringify(this.form.getRawValue());
  }
}
