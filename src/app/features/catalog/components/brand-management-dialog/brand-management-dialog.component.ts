import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { BrandService } from '../../../../core/services/brand.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

export interface DeletedBrandAssignment {
  readonly brandId: string;
  readonly replacementBrandId: string | null;
}

@Component({
  selector: 'app-brand-management-dialog',
  imports: [ButtonComponent, CustomSelectComponent, ModalShellComponent],
  templateUrl: './brand-management-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandManagementDialogComponent {
  protected readonly brandService = inject(BrandService);
  readonly closed = output<void>();
  readonly brandDeleted = output<DeletedBrandAssignment>();
  readonly selectedBrandId = signal<string | null>(null);
  readonly replacementBrandId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly resultMessage = signal<string | null>(null);

  readonly brandOptions = computed<SelectOption<string | null>[]>(() => [
    { value: null, label: 'Marke wählen' },
    ...this.brandService.brands().map((brand) => ({ value: brand.id, label: brand.name })),
  ]);
  readonly replacementOptions = computed<SelectOption<string | null>[]>(() => [
    { value: null, label: 'Zuordnungen entfernen' },
    ...this.brandService
      .brands()
      .filter((brand) => brand.id !== this.selectedBrandId())
      .map((brand) => ({ value: brand.id, label: `Durch ${brand.name} ersetzen` })),
  ]);

  constructor() {
    void this.brandService.ensureLoaded();
  }

  selectBrand(brandId: string | null): void {
    this.selectedBrandId.set(brandId);
    if (this.replacementBrandId() === brandId) this.replacementBrandId.set(null);
    this.error.set(null);
    this.resultMessage.set(null);
  }

  async deleteSelectedBrand(): Promise<void> {
    const brandId = this.selectedBrandId();
    if (!brandId || this.saving()) return;
    const replacementBrandId = this.replacementBrandId();
    this.saving.set(true);
    this.error.set(null);
    this.resultMessage.set(null);
    const result = await this.brandService.replaceAndDelete(brandId, replacementBrandId);
    this.saving.set(false);
    if (result.error || !result.data) {
      this.error.set(result.error?.message ?? 'Die Marke konnte nicht gelöscht werden.');
      return;
    }
    this.brandDeleted.emit({ brandId, replacementBrandId });
    this.selectedBrandId.set(null);
    this.replacementBrandId.set(null);
    this.resultMessage.set(
      result.data.reassigned > 0
        ? `${result.data.reassigned} Zuordnung(en) wurden aktualisiert und die Marke wurde gelöscht.`
        : 'Die Marke wurde gelöscht.',
    );
  }
}
