import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import IntlTelInput from '@intl-tel-input/angular/with-utils';
import { de as germanPhoneTranslations } from 'intl-tel-input/locale';
import { SuppliersService } from '../../../../core/services/suppliers.service';
import { SellerFormValue, Supplier } from '../../../../core/models/flipbase.models';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { buildGermanCountryOptions } from '../../utils/country-options';

@Component({
  selector: 'app-purchase-seller-dialog',
  imports: [ReactiveFormsModule, ModalDialogDirective, IntlTelInput],
  templateUrl: './purchase-seller-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PurchaseSellerDialogComponent {
  private readonly suppliers = inject(SuppliersService);

  readonly seller = input<Supplier | null>(null);
  readonly closed = output<void>();
  readonly created = output<Supplier>();
  readonly saved = output<Supplier>();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEditing = computed(() => this.seller() !== null);
  readonly dialogTitle = computed(() =>
    this.isEditing() ? 'Verkäufer bearbeiten' : 'Verkäufer erstellen',
  );
  readonly countries = buildGermanCountryOptions();
  readonly phoneTranslations = germanPhoneTranslations;
  readonly phoneInputAttributes = {
    class: 'linear-input w-full rounded-lg px-3 py-2',
    'aria-label': 'Telefonnummer',
    autocomplete: 'tel',
  };

  readonly form = new FormGroup({
    seller_type: new FormControl<'private' | 'business'>('private', { nonNullable: true }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    contact_person: new FormControl('', { nonNullable: true }),
    country_code: new FormControl('DE', { nonNullable: true }),
    street: new FormControl('', { nonNullable: true }),
    address_extra: new FormControl('', { nonNullable: true }),
    postal_code: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    phone: new FormControl('', { nonNullable: true }),
    website: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  readonly contactFields = [
    { key: 'street', label: 'Straße und Hausnummer' },
    { key: 'address_extra', label: 'Adresszusatz' },
    { key: 'postal_code', label: 'Postleitzahl' },
    { key: 'city', label: 'Ort' },
    { key: 'email', label: 'E-Mail' },
  ] as const;

  constructor() {
    effect(() => {
      const seller = this.seller();
      if (!seller) return;

      this.form.reset({
        seller_type: seller.seller_type === 'business' ? 'business' : 'private',
        name: seller.name,
        contact_person: seller.contact_person ?? '',
        country_code: seller.country_code ?? 'DE',
        street: seller.street ?? '',
        address_extra: seller.address_extra ?? '',
        postal_code: seller.postal_code ?? '',
        city: seller.city ?? '',
        email: seller.email ?? '',
        phone: seller.phone ?? '',
        website: seller.website ?? '',
        notes: seller.notes ?? '',
      });
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    const rawValue = this.form.getRawValue();
    const name = rawValue.name.trim();
    if (!name.trim()) {
      this.error.set('Bitte einen Anzeigenamen angeben.');
      return;
    }

    const value: SellerFormValue = {
      seller_type: rawValue.seller_type,
      name,
      contact_person:
        rawValue.seller_type === 'business' ? this.trimOrNull(rawValue.contact_person) : null,
      country_code: rawValue.country_code || null,
      street: this.trimOrNull(rawValue.street),
      address_extra: this.trimOrNull(rawValue.address_extra),
      postal_code: this.trimOrNull(rawValue.postal_code),
      city: this.trimOrNull(rawValue.city),
      email: this.trimOrNull(rawValue.email),
      phone: this.trimOrNull(rawValue.phone),
      website: rawValue.seller_type === 'business' ? this.trimOrNull(rawValue.website) : null,
      notes: this.trimOrNull(rawValue.notes),
    };

    this.saving.set(true);
    this.error.set(null);
    try {
      const currentSeller = this.seller();
      const result = currentSeller
        ? await this.suppliers.updateSupplier(currentSeller.id, value)
        : await this.suppliers.createSupplier(value);
      if (result.error || !result.data)
        this.error.set(result.error?.message ?? 'Verkäufer konnte nicht gespeichert werden.');
      else {
        this.saved.emit(result.data);
        if (!currentSeller) this.created.emit(result.data);
      }
    } catch (cause: unknown) {
      this.error.set(
        cause instanceof Error ? cause.message : 'Verkäufer konnte nicht gespeichert werden.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  private trimOrNull(value: string): string | null {
    return value.trim() || null;
  }
}
