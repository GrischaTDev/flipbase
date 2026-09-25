import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { BrandService } from '../../../../core/services/brand.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { BrandManagementDialogComponent } from '../../components/brand-management-dialog/brand-management-dialog.component';

@Component({
  selector: 'app-brand-management',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    CardComponent,
    PageHeaderComponent,
    TextFieldComponent,
    BrandManagementDialogComponent,
  ],
  templateUrl: './brand-management.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandManagementComponent {
  readonly brands = inject(BrandService);
  readonly search = new FormControl('', { nonNullable: true });
  readonly newName = new FormControl('', { nonNullable: true });
  readonly editingName = new FormControl('', { nonNullable: true });
  readonly searchValue = toSignal(this.search.valueChanges, { initialValue: '' });
  readonly filtered = computed(() => this.brands.search(this.searchValue(), 1000));
  readonly editingId = signal<string | null>(null);
  readonly deleteOpen = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  constructor() {
    void this.brands.ensureLoaded();
  }

  async add(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.message.set(null);
    const result = await this.brands.create(this.newName.value);
    this.saving.set(false);
    if (result.error) this.error.set(result.error.message);
    else {
      this.newName.reset('');
      this.message.set('Marke angelegt.');
    }
  }

  edit(id: string, name: string): void {
    this.editingId.set(id);
    this.editingName.setValue(name);
    this.error.set(null);
  }

  async rename(): Promise<void> {
    const id = this.editingId();
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    const result = await this.brands.rename(id, this.editingName.value);
    this.saving.set(false);
    if (result.error) this.error.set(result.error.message);
    else {
      this.editingId.set(null);
      this.message.set('Marke umbenannt.');
    }
  }
}
