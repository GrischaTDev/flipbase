import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, model } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import {
  favoriteDiscountPreview,
  validateFavoriteOffer,
  type FavoriteOfferConfig,
} from '../../models/vinted-favorite-messages';

@Component({
  selector: 'app-vinted-favorite-discount-field',
  imports: [CurrencyPipe, DecimalPipe, NumberInputComponent, ReactiveFormsModule],
  templateUrl: './vinted-favorite-discount-field.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedFavoriteDiscountFieldComponent {
  readonly accountOffer = input<FavoriteOfferConfig | null>(null);
  readonly priceCents = input<number | null>(null);
  readonly currency = input('EUR');
  readonly disabled = input(false);
  readonly discountPercent = model<number | null>(null);

  readonly control = new FormControl<number | null>(null);
  readonly offer = computed<FavoriteOfferConfig | null>(() => {
    const discountPercent = this.discountPercent();
    return discountPercent === null
      ? this.accountOffer()
      : { type: 'percentage', value: discountPercent };
  });
  readonly inputError = computed(() => {
    const discountPercent = this.discountPercent();
    return discountPercent !== null &&
      !validateFavoriteOffer({ type: 'percentage', value: discountPercent })
      ? 'Gib 1 bis 50 Prozent mit höchstens zwei Nachkommastellen ein.'
      : null;
  });
  readonly preview = computed(() => {
    const priceCents = this.priceCents();
    const offer = this.offer();
    if (
      priceCents === null ||
      priceCents <= 0 ||
      this.inputError() ||
      (offer?.type === 'amount' && this.currency() !== 'EUR')
    )
      return null;
    return offer
      ? favoriteDiscountPreview(priceCents, offer)
      : {
          originalPriceCents: priceCents,
          offerPriceCents: priceCents,
          discountCents: 0,
          discountPercent: 0,
        };
  });

  constructor() {
    effect(() => {
      if (this.disabled()) this.control.disable({ emitEvent: false });
      else this.control.enable({ emitEvent: false });
    });
    this.control.valueChanges.pipe(takeUntilDestroyed()).subscribe((amount) => {
      // Eine fehlerhafte Eingabe darf beim Speichern keinen Rabatt zurücksetzen.
      this.discountPercent.set(this.control.hasError('number') ? Number.NaN : amount);
    });
    effect(() => {
      const discountPercent = this.discountPercent();
      if (!Number.isNaN(discountPercent) && discountPercent !== this.control.value) {
        this.control.setValue(discountPercent, { emitEvent: false });
      }
    });
  }
}
