import type { SaleCostCategory, ShippingMode } from '../../../core/models/flipbase.models';
import type { EbaySaleTarget } from '../../../../../supabase/functions/_shared/ebay-order-import-contracts';
import type { SaleTarget } from '../../../core/models/sale-target.models';
import type { RecordSaleInput } from '../../../core/services/sales.service';

export interface ExternalSaleEntryLine {
  readonly sourceLineId: string;
  readonly title: string;
  readonly quantity: number;
  readonly unitSalePrice: number;
  readonly target: SaleTarget | null;
}
export interface ExternalSaleEntryDraft {
  readonly revision: string;
  readonly platform: string;
  readonly saleDate: string;
  readonly externalOrderId: string;
  readonly shippingRevenue: number;
  readonly lines: readonly ExternalSaleEntryLine[];
  readonly requireConfirmedCosts: true;
  readonly platformFee?: number | null;
  readonly shippingCost?: number | null;
  readonly shippingMode?: ShippingMode | null;
  readonly additionalCosts?: readonly {
    readonly category: SaleCostCategory;
    readonly description: string | null;
    readonly amount: number;
  }[];
  readonly reservations?: readonly { readonly target: EbaySaleTarget; readonly quantity: number }[];
}
export type ExternalSaleEntrySaveResult =
  | { readonly status: 'saved' }
  | { readonly status: 'review_changed' }
  | { readonly status: 'outcome_unknown' }
  | { readonly status: 'rejected'; readonly message: string };
export type ExternalSaleEntrySubmit = (
  input: RecordSaleInput,
) => Promise<ExternalSaleEntrySaveResult>;

export interface ExternalSaleEntryEditorSnapshot {
  readonly platformFee: number | null;
  readonly shippingCost: number | null;
  readonly shippingMode: ShippingMode | null;
  readonly additionalCosts: readonly {
    readonly category: SaleCostCategory;
    readonly description: string | null;
    readonly amount: number;
  }[];
  readonly lines: readonly { readonly sourceLineId: string; readonly target: SaleTarget | null }[];
}
