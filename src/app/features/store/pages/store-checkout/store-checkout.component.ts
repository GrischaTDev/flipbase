import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
} from 'lucide-angular';
import { StoreService } from '../../../../core/services/store.service';
import { CheckoutCustomerInfo } from '../../../../core/models/store.models';

@Component({
  selector: 'app-store-checkout',
  imports: [RouterLink, ReactiveFormsModule, CurrencyPipe, LucideAngularModule],
  templateUrl: './store-checkout.component.html',
  styleUrl: './store-checkout.component.scss',
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

  readonly isSubmitting = signal<boolean>(false);

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
    paymentMethod: new FormControl<'paypal' | 'bank_transfer' | 'cash_on_pickup'>('paypal', {
      nonNullable: true,
    }),
    notes: new FormControl(''),
  });

  async onSubmitOrder(): Promise<void> {
    if (this.form.invalid || this.storeService.cart().length === 0) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const customerInfo = this.form.getRawValue() as CheckoutCustomerInfo;

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
