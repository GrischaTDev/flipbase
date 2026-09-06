import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SuppliersService } from '../../../../core/services/suppliers.service';
import { Supplier } from '../../../../core/models/flipbase.models';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
@Component({
  selector: 'app-purchase-seller-dialog',
  imports: [ReactiveFormsModule, ModalDialogDirective],
  templateUrl: './purchase-seller-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseSellerDialogComponent {
  private readonly suppliers = inject(SuppliersService);
  readonly closed = output<void>();
  readonly created = output<Supplier>();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = new FormGroup({
    seller_type: new FormControl<'private' | 'business'>('private', { nonNullable: true }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    contact_person: new FormControl('', { nonNullable: true }),
    country: new FormControl('Deutschland', { nonNullable: true }),
    street: new FormControl('', { nonNullable: true }),
    address_extra: new FormControl('', { nonNullable: true }),
    postal_code: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    phone: new FormControl('', { nonNullable: true }),
    profile_url: new FormControl('', { nonNullable: true }),
    website: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });
  readonly contactFields = [
    { key: 'country', label: 'Land' },
    { key: 'street', label: 'Straße und Hausnummer' },
    { key: 'address_extra', label: 'Adresszusatz' },
    { key: 'postal_code', label: 'Postleitzahl' },
    { key: 'city', label: 'Ort' },
    { key: 'email', label: 'E-Mail' },
    { key: 'phone', label: 'Telefon' },
    { key: 'profile_url', label: 'Plattform / Profilverweis' },
  ] as const;
  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    const { name, notes, ...details } = this.form.getRawValue();
    if (!name.trim()) {
      this.error.set('Bitte einen Anzeigenamen angeben.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.suppliers.createSupplier(name, undefined, notes, {
        ...details,
        website: details.seller_type === 'business' ? details.website : null,
        contact_person: details.seller_type === 'business' ? details.contact_person : null,
      });
      if (result.error || !result.data)
        this.error.set(result.error?.message ?? 'Verkäufer konnte nicht erstellt werden.');
      else this.created.emit(result.data);
    } catch (cause: unknown) {
      this.error.set(
        cause instanceof Error ? cause.message : 'Verkäufer konnte nicht erstellt werden.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
