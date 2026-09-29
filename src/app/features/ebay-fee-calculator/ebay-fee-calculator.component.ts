import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideCalculator as Calculator,
  LucideDynamicIcon,
  LucideInfo as Info,
  LucideTrendingUp as TrendingUp,
} from '@lucide/angular';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { CustomCheckboxComponent } from '../../shared/components/custom-checkbox/custom-checkbox.component';
import { NumberInputComponent } from '../../shared/components/number-input/number-input.component';
import {
  RouteTabsComponent,
  type RouteTab,
} from '../../shared/components/route-tabs/route-tabs.component';
import {
  EBAY_CATEGORY_DEFINITIONS,
  EBAY_FEE_RULES_VALID_FROM,
  EBAY_SHOP_MONTHLY_NET,
  calculateEbayFees,
  type EbayCategoryKey,
  type EbayCondition,
  type EbayDestination,
  type EbayFeeResult,
  type EbayListingFormat,
  type EbaySellerType,
  type EbayShopType,
} from './ebay-fees';

@Component({
  selector: 'app-ebay-fee-calculator',
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    LucideDynamicIcon,
    CustomSelectComponent,
    CustomCheckboxComponent,
    NumberInputComponent,
    RouteTabsComponent,
  ],
  templateUrl: './ebay-fee-calculator.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EbayFeeCalculatorComponent {
  readonly calculatorIcon = Calculator;
  readonly infoIcon = Info;
  readonly trendingIcon = TrendingUp;

  readonly tabs: readonly RouteTab[] = [
    { id: 'deal', label: 'Deal-Rechner', path: '/deal-calculator' },
    { id: 'ebay', label: 'eBay-Gebühren', path: '/deal-calculator/ebay' },
  ];

  readonly sellerTypeOptions: readonly SelectOption<EbaySellerType>[] = [
    { value: 'private', label: 'Privat' },
    { value: 'business', label: 'Gewerblich' },
  ];

  readonly shopOptions: readonly SelectOption<EbayShopType>[] = [
    { value: 'none', label: 'Kein eBay Shop' },
    { value: 'basic', label: 'Basis-Shop', description: '39,95 € netto / Monat' },
    { value: 'top', label: 'Top-Shop', description: '79,95 € netto / Monat' },
    { value: 'premium', label: 'Premium-Shop', description: '299,95 € netto / Monat' },
    { value: 'platinum', label: 'Platin-Shop', description: '4.999,95 € netto / Monat' },
  ];

  readonly categoryOptions: readonly SelectOption<EbayCategoryKey>[] =
    EBAY_CATEGORY_DEFINITIONS.map((category) => ({
      value: category.key,
      label: category.label,
      description: category.description,
      searchText: `${category.label} ${category.description} ${category.categoryIds.join(' ')}`,
    }));

  readonly conditionOptions: readonly SelectOption<EbayCondition>[] = [
    { value: 'new', label: 'Neu' },
    { value: 'new-other', label: 'Neu: Sonstige' },
    { value: 'refurbished', label: 'Refurbished' },
    { value: 'seller-refurbished', label: 'Vom Verkäufer generalüberholt' },
    { value: 'used', label: 'Gebraucht' },
    { value: 'used-excellent', label: 'Gebraucht – Hervorragend' },
    { value: 'used-good', label: 'Gebraucht – Gut' },
    { value: 'used-acceptable', label: 'Gebraucht – Akzeptabel' },
  ];

  readonly destinationOptions: readonly SelectOption<EbayDestination>[] = [
    { value: 'germany', label: 'Deutschland' },
    { value: 'eurozone-sweden', label: 'Eurozone oder Schweden' },
    { value: 'europe-us-canada', label: 'Übriges Europa / USA / Kanada' },
    { value: 'uk', label: 'Vereinigtes Königreich' },
    { value: 'rest-world', label: 'Übrige Welt' },
  ];

  readonly listingFormatOptions: readonly SelectOption<EbayListingFormat>[] = [
    { value: 'fixed-price', label: 'Festpreisangebot' },
    { value: 'auction', label: 'Auktion' },
  ];

  readonly form = new FormGroup({
    sellerType: new FormControl<EbaySellerType>('business', { nonNullable: true }),
    shopType: new FormControl<EbayShopType>('none', { nonNullable: true }),
    category: new FormControl<EbayCategoryKey>('clothing-accessories', { nonNullable: true }),
    condition: new FormControl<EbayCondition>('used', { nonNullable: true }),
    salePrice: new FormControl(49.99, { nonNullable: true }),
    buyerShipping: new FormControl(5.49, { nonNullable: true }),
    purchaseCost: new FormControl(15, { nonNullable: true }),
    actualShippingCost: new FormControl(5.49, { nonNullable: true }),
    packagingCost: new FormControl(0.5, { nonNullable: true }),
    promotedRatePercent: new FormControl(0, { nonNullable: true }),
    destination: new FormControl<EbayDestination>('germany', { nonNullable: true }),
    useEbayInternationalShipping: new FormControl(false, { nonNullable: true }),
    includeBusinessFeeVat: new FormControl(true, { nonNullable: true }),
    listingOutsideFreeQuota: new FormControl(false, { nonNullable: true }),
    listingFormat: new FormControl<EbayListingFormat>('fixed-price', { nonNullable: true }),
  });

  readonly sellerType = signal<EbaySellerType>(this.form.controls.sellerType.value);
  readonly shopType = signal<EbayShopType>(this.form.controls.shopType.value);
  readonly destination = signal<EbayDestination>(this.form.controls.destination.value);
  readonly listingOutsideFreeQuota = signal(this.form.controls.listingOutsideFreeQuota.value);
  readonly result = signal<EbayFeeResult>(calculateEbayFees(this.form.getRawValue()));

  readonly selectedShopMonthlyFee = computed(() => EBAY_SHOP_MONTHLY_NET[this.shopType()]);
  readonly rulesValidFrom = EBAY_FEE_RULES_VALID_FROM;

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.sellerType.set(this.form.controls.sellerType.value);
      this.shopType.set(this.form.controls.shopType.value);
      this.destination.set(this.form.controls.destination.value);
      this.listingOutsideFreeQuota.set(this.form.controls.listingOutsideFreeQuota.value);
      this.result.set(calculateEbayFees(this.form.getRawValue()));
    });
  }
}
