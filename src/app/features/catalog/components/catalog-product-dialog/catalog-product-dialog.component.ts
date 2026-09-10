import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import type { CatalogProduct, TrackingMode } from '../../../../core/models/flipbase.models';
import { CatalogService } from '../../../../core/services/catalog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { normalizeGtin } from '../../../../shared/utils/gtin';

const maxImageSize = 5 * 1024 * 1024;
const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Component({
  selector: 'app-catalog-product-dialog',
  imports: [ReactiveFormsModule, ModalShellComponent],
  templateUrl: './catalog-product-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogProductDialogComponent {
  private readonly catalogService = inject(CatalogService);
  private readonly workspaceService = inject(WorkspaceService);

  readonly closed = output<void>();
  readonly saved = output<CatalogProduct>();
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly selectedImage = signal<File | null>(null);
  readonly imageError = signal<string | null>(null);

  readonly form = new FormGroup(
    {
      title: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(2)],
      }),
      ean: new FormControl('', {
        nonNullable: true,
        validators: [
          (control) => {
            const value = control.value.trim();
            return value && !normalizeGtin(value) ? { invalidGtin: true } : null;
          },
        ],
      }),
      trackingMode: new FormControl<TrackingMode>('quantity', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      isPublicStore: new FormControl(false, { nonNullable: true }),
      listingPrice: new FormControl<number | null>(null),
    },
    { validators: CatalogProductDialogComponent.publicListingPriceValidator },
  );

  static publicListingPriceValidator(control: AbstractControl): ValidationErrors | null {
    const isPublic = Boolean(control.get('isPublicStore')?.value);
    const price = Number(control.get('listingPrice')?.value);
    return isPublic && (!Number.isFinite(price) || price <= 0)
      ? { publicListingPrice: true }
      : null;
  }

  onImageSelected(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    this.selectImage(input.files?.[0] ?? null);
  }

  selectImage(file: File | null): void {
    this.imageError.set(null);
    this.selectedImage.set(null);
    if (!file) return;
    if (!acceptedImageTypes.has(file.type)) {
      this.imageError.set('Bitte eine Bilddatei im Format JPG, PNG oder WebP auswählen.');
      return;
    }
    if (file.size > maxImageSize) {
      this.imageError.set('Das Produktbild darf höchstens 5 MB groß sein.');
      return;
    }
    this.selectedImage.set(file);
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.imageError() || this.saving()) return;
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId) {
      this.saveError.set('Kein aktiver Workspace ausgewählt.');
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    try {
      const value = this.form.getRawValue();
      const result = await this.catalogService.createProduct({
        workspaceId,
        title: value.title,
        ean: normalizeGtin(value.ean) ?? null,
        trackingMode: value.trackingMode,
        isPublicStore: value.isPublicStore,
        listingPrice: value.isPublicStore ? value.listingPrice : null,
        imageFile: this.selectedImage(),
      });
      if (result.error || !result.data) {
        this.saveError.set(result.error?.message ?? 'Der Artikel konnte nicht angelegt werden.');
        return;
      }
      this.saved.emit(result.data);
    } catch (cause: unknown) {
      this.saveError.set(
        cause instanceof Error ? cause.message : 'Der Artikel konnte nicht angelegt werden.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
