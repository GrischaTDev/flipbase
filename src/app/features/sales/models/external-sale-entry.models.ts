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
}
export type ExternalSaleEntrySaveResult =
  | { readonly status: 'saved' }
  | { readonly status: 'review_changed' }
  | { readonly status: 'outcome_unknown' }
  | { readonly status: 'rejected'; readonly message: string };
export type ExternalSaleEntrySubmit = (
  input: RecordSaleInput,
) => Promise<ExternalSaleEntrySaveResult>;
