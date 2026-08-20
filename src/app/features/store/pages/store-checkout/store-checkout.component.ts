import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyPipe } from '@angular/common';
import {
  LucideAngularModule,
  ArrowLeft,
  ShieldCheck,
  Truck,
  CreditCard,
  Building,
  Banknote,
  CheckCircle2,
  Lock,
  Copy,
  Check,
  Zap,
} from 'lucide-angular';
import { StoreService } from '../../../../core/services/store.service';
import { CheckoutCustomerInfo } from '../../../../core/models/store.models';

@Component({
  selector: 'app-store-checkout',
  imports: [RouterLink, ReactiveFormsModule, CurrencyPipe, LucideAngularModule],
  templateUrl: './store-checkout.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreCheckoutComponent {
  readonly storeService = inject(StoreService);
  private readonly router = inject(Router);

  readonly backIcon = ArrowLeft;
  readonly shieldIcon = ShieldCheck;
  readonly truckIcon = Truck;
  readonly cardIcon = CreditCard;
  readonly bankIcon = Building;
  readonly cashIcon = Banknote;
  readonly checkIcon = CheckCircle2;
  readonly lockIcon = Lock;
  readonly copyIcon = Copy;
  readonly checkCheckIcon = Check;
  readonly zapIcon = Zap;

  readonly isSubmitting = signal<boolean>(false);
  readonly isIbanCopied = signal<boolean>(false);

  readonly form = new FormGroup({
    firstName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    lastName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    phone: new FormControl(''),
    street: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    houseNumber: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    zip: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    city: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    country: new FormControl('Deutschland', { nonNullable: true, validators: [Validators.required] }),
    shippingMethod: new FormControl<'dhl_standard' | 'hermes_standard' | 'pickup'>('dhl_standard', {
      nonNullable: true,
    }),
    paymentMethod: new FormControl<'stripe_card' | 'paypal' | 'bank_transfer' | 'cash_on_pickup'>('stripe_card', {
      nonNullable: true,
    }),
    cardNumber: new FormControl('4242 •••• •••• 4242'),
    cardExpiry: new FormControl('12/28'),
    cardCvc: new FormControl('123'),
    cardHolder: new FormControl('Max Mustermann'),
    notes: new FormControl(''),
  });

  readonly selectedPayment = computed(() => this.form.controls.paymentMethod.value);

  readonly detectedCardBrand = computed(() => {
    const num = this.form.controls.cardNumber.value || '';
    if (num.startsWith('4')) return 'Visa';
    if (num.startsWith('5')) return 'Mastercard';
    if (num.startsWith('3')) return 'Amex';
    return 'Credit Card';
  });

  copyIban(iban: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(iban.replace(/\s+/g, ''));
      this.isIbanCopied.set(true);
      setTimeout(() => this.isIbanCopied.set(false), 2000);
    }
  }

  async onSubmitOrder(): Promise<void> {
    if (this.form.invalid || this.storeService.cart().length === 0) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const val = this.form.getRawValue();

    const customerInfo: CheckoutCustomerInfo = {
      firstName: val.firstName,
      lastName: val.lastName,
      email: val.email,
      phone: val.phone || undefined,
      street: val.street,
      houseNumber: val.houseNumber,
      zip: val.zip,
      city: val.city,
      country: val.country,
      shippingMethod: val.shippingMethod,
      paymentMethod: val.paymentMethod,
      cardDetails:
        val.paymentMethod === 'stripe_card'
          ? {
              holder: val.cardHolder || 'Karteninhaber',
              last4: (val.cardNumber || '4242').slice(-4),
              brand: this.detectedCardBrand(),
            }
          : undefined,
      notes: val.notes || undefined,
    };

    try {
      const order = await this.storeService.placeOrder(customerInfo);
      this.isSubmitting.set(false);
      this.router.navigate(['/shop/order-success', order.id]);
    } catch (e) {
      this.isSubmitting.set(false);
      console.error('Order submission error:', e);
    }
  }
}
