import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { CatalogProduct, ItemCondition } from '../../../../core/models/flipbase.models';
import {
  CatalogService,
  CreateCatalogProductInput,
} from '../../../../core/services/catalog.service';
import { MediaService } from '../../../../core/services/media.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { WorkspaceContextLockService } from '../../../../core/services/workspace-context-lock.service';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BrandPickerComponent } from '../../../../shared/components/brand-picker/brand-picker.component';
import { CategoryPickerComponent } from '../../../../shared/components/category-picker/category-picker.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { normalizeGtin } from '../../../../shared/utils/gtin';
import { PRODUCT_CONDITIONS } from '../../../../core/config/product-conditions';
import {
  BrandManagementDialogComponent,
  DeletedBrandAssignment,
} from '../brand-management-dialog/brand-management-dialog.component';

type ProductDialogInitialProduct = Partial<Omit<CreateCatalogProductInput, 'workspaceId'>> & {
  brandId?: string | null;
  categoryId?: string | null;
};

@Component({
  selector: 'app-product-dialog',
  imports: [
    ReactiveFormsModule,
    ModalShellComponent,
    TextFieldComponent,
    ButtonComponent,
    CustomSelectComponent,
    CustomCheckboxComponent,
    NumberInputComponent,
    BrandPickerComponent,
    CategoryPickerComponent,
    BrandManagementDialogComponent,
  ],
  templateUrl: './product-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDialogComponent {
  static publicListingPriceValidator(control: AbstractControl): ValidationErrors | null {
    const price = control.get('listingPrice')?.value;
    return control.get('isPublicStore')?.value && (!Number.isFinite(price) || price <= 0)
      ? { publicListingPrice: true }
      : null;
  }
  private readonly catalog = inject(CatalogService);
  private readonly media = inject(MediaService);
  private readonly workspace = inject(WorkspaceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly workspaceContext = inject(WorkspaceContextLockService);
  private readonly releaseWorkspaceLock = this.workspaceContext.acquire();
  readonly initialProduct = input<ProductDialogInitialProduct | null>(null);
  readonly closed = output<void>();
  readonly created = output<CatalogProduct>();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedProduct = signal<CatalogProduct | null>(null);
  readonly images = signal<readonly File[]>([]);
  readonly categorySuggestion = signal<string | null>(null);
  readonly brandSuggestion = signal<string | null>(null);
  readonly brandManagerOpen = signal(false);
  readonly conditionOptions: readonly SelectOption<string>[] = [
    { value: '', label: 'Nicht angegeben' },
    ...PRODUCT_CONDITIONS,
  ];
  readonly form = new FormGroup(
    {
      title: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          (control) => (control.value.trim() ? null : { required: true }),
        ],
      }),
      ean: new FormControl('', {
        nonNullable: true,
        validators: [
          (control) =>
            control.value.trim() && !normalizeGtin(control.value) ? { gtin: true } : null,
        ],
      }),
      sku: new FormControl('', { nonNullable: true }),
      brandId: new FormControl<string | null>(null),
      model: new FormControl('', { nonNullable: true }),
      size: new FormControl('', { nonNullable: true }),
      color: new FormControl('', { nonNullable: true }),
      material: new FormControl('', { nonNullable: true }),
      description: new FormControl('', { nonNullable: true }),
      categoryId: new FormControl<string | null>(null),
      condition: new FormControl<ItemCondition | ''>('', { nonNullable: true }),
      conditionNotes: new FormControl('', { nonNullable: true }),
      isPublicStore: new FormControl(false, { nonNullable: true }),
      listingPrice: new FormControl<number | null>(null),
    },
    { validators: ProductDialogComponent.publicListingPriceValidator },
  );
  readonly workspaceChanged = computed(() => {
    const saved = this.savedProduct();
    return !!saved && saved.workspace_id !== this.workspace.currentWorkspace()?.id;
  });

  constructor() {
    this.destroyRef.onDestroy(this.releaseWorkspaceLock);
    effect(() => {
      const value = this.initialProduct();
      if (!value || this.form.dirty) return;
      this.form.patchValue({
        title: value.title ?? '',
        ean: value.ean ?? '',
        sku: value.sku ?? '',
        brandId: value.brandId ?? null,
        model: value.model ?? '',
        size: value.size ?? '',
        color: value.color ?? '',
        material: value.material ?? '',
        description: value.description ?? '',
        categoryId: value.categoryId ?? null,
        condition: value.condition ?? '',
        conditionNotes: value.conditionNotes ?? '',
        isPublicStore: value.isPublicStore ?? false,
        listingPrice: value.listingPrice ?? null,
      });
      this.brandSuggestion.set(value.brandId ? null : value.brand?.trim() || null);
      this.categorySuggestion.set(value.categoryId ? null : value.category?.trim() || null);
    });
  }

  selectImages(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.images.set(Array.from(target.files ?? []));
  }

  close(): void {
    if (!this.saving()) this.closed.emit();
  }

  onBrandDeleted(change: DeletedBrandAssignment): void {
    if (this.form.controls.brandId.value === change.brandId)
      this.form.controls.brandId.setValue(change.replacementBrandId);
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving() || this.workspaceChanged()) return;
    const workspaceId = this.workspace.currentWorkspace()?.id;
    if (!workspaceId) {
      this.error.set('Kein aktiver Workspace ausgewählt.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      let product = this.savedProduct();
      if (!product) {
        const value = this.form.getRawValue();
        const result = await this.catalog.createProduct({
          ...value,
          workspaceId,
          ean: normalizeGtin(value.ean),
          condition: value.condition || null,
          listingPrice: value.isPublicStore ? value.listingPrice : null,
        });
        if (result.error || !result.data)
          throw result.error ?? new Error('Produkt konnte nicht gespeichert werden.');
        product = result.data;
        this.savedProduct.set(product);
        this.form.disable();
      }
      if (workspaceId !== this.workspace.currentWorkspace()?.id)
        throw new Error(
          'Workspace wurde gewechselt. Das Produkt ist im ursprünglichen Workspace gespeichert.',
        );
      const failedImages: File[] = [];
      for (const file of this.images()) {
        const result = await this.media.uploadProductMedia(product.id, file);
        if (result.error) failedImages.push(file);
      }
      this.images.set(failedImages);
      if (failedImages.length > 0) {
        throw new Error(
          `Produkt gespeichert. ${failedImages.length === 1 ? 'Bild konnte' : `${failedImages.length} Bilder konnten`} nicht gespeichert werden.`,
        );
      }
      if (workspaceId !== this.workspace.currentWorkspace()?.id) return;
      await this.catalog.loadProducts(workspaceId);
      if (workspaceId !== this.workspace.currentWorkspace()?.id) return;
      this.created.emit(product);
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error ? error.message : 'Produkt konnte nicht gespeichert werden.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  continueWithoutImage(): void {
    const product = this.savedProduct();
    if (product && !this.workspaceChanged() && !this.saving()) this.created.emit(product);
  }
}
