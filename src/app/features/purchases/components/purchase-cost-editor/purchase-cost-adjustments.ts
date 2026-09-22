import { PurchaseCostTaxTreatment } from '../../../../core/models/flipbase.models';
import { SelectOption } from '../../../../shared/components/custom-select/custom-select.component';

export type PurchaseCostType =
  'shipping' | 'travel' | 'packaging' | 'transport' | 'customs' | 'import' | 'fee' | 'other';

export type { PurchaseCostTaxTreatment } from '../../../../core/models/flipbase.models';

export const PURCHASE_COST_TAX_TREATMENT_OPTIONS: readonly SelectOption<PurchaseCostTaxTreatment | null>[] =
  [
    { value: null, label: 'Noch prüfen' },
    { value: 'purchase_price', label: 'Vom Verkäufer berechnet' },
    { value: 'expense', label: 'Separat bezahlt' },
  ];

export interface PurchaseCostDraft {
  readonly type: PurchaseCostType;
  readonly amount: number;
  readonly description: string;
  readonly taxTreatment?: PurchaseCostTaxTreatment | null;
  readonly allocationMethod: 'by_value' | 'by_quantity' | 'direct';
  readonly targetPurchaseLineId: string | null;
}

export type PurchaseCostAdjustment =
  'shipping' | 'buyer_protection_fee' | 'customs_fee' | 'discount' | 'insurance' | 'other';

export interface PurchaseCostAdjustmentRow {
  readonly adjustment: PurchaseCostAdjustment | null;
  readonly amount: number | null;
  readonly allocationMethod: PurchaseCostDraft['allocationMethod'];
  readonly targetPurchaseLineId: string | null;
  readonly sourceCost: PurchaseCostDraft | null;
  readonly taxTreatment?: PurchaseCostTaxTreatment | null;
}

export interface PurchaseCostOverviewValue {
  readonly discountAmount: number;
  readonly costs: readonly PurchaseCostDraft[];
}

export const PURCHASE_COST_ADJUSTMENT_OPTIONS: readonly SelectOption<PurchaseCostAdjustment>[] = [
  { value: 'shipping', label: 'Versandkosten' },
  { value: 'buyer_protection_fee', label: 'Käuferschutzgebühr' },
  { value: 'customs_fee', label: 'Zollgebühren' },
  { value: 'insurance', label: 'Versicherung' },
  { value: 'discount', label: 'Rabatt' },
  { value: 'other', label: 'Sonstiges' },
];

const newCostDefaults: Readonly<
  Record<
    Exclude<PurchaseCostAdjustment, 'discount'>,
    Pick<PurchaseCostDraft, 'type' | 'description'>
  >
> = {
  shipping: { type: 'shipping', description: 'Versandkosten' },
  buyer_protection_fee: { type: 'fee', description: 'Käuferschutzgebühr' },
  customs_fee: { type: 'customs', description: 'Zollgebühren' },
  insurance: { type: 'fee', description: 'Versicherung' },
  other: { type: 'other', description: 'Sonstiges' },
};

export function createPurchaseCostAdjustmentRows(
  costs: readonly PurchaseCostDraft[],
  discountAmount: number,
): readonly PurchaseCostAdjustmentRow[] {
  const rows: PurchaseCostAdjustmentRow[] = costs.map((cost) => ({
    adjustment: adjustmentForCost(cost),
    amount: cost.amount,
    allocationMethod: cost.allocationMethod,
    targetPurchaseLineId: cost.targetPurchaseLineId,
    sourceCost: cost,
    taxTreatment: cost.taxTreatment ?? null,
  }));
  if (discountAmount > 0) {
    rows.push({
      adjustment: 'discount',
      amount: discountAmount,
      allocationMethod: 'by_value',
      targetPurchaseLineId: null,
      sourceCost: null,
      taxTreatment: null,
    });
  }
  return rows;
}

export function serializePurchaseCostAdjustmentRows(
  rows: readonly PurchaseCostAdjustmentRow[],
): PurchaseCostOverviewValue {
  let discountAmount = 0;
  const costs: PurchaseCostDraft[] = [];

  for (const row of rows) {
    if (row.adjustment === null || row.amount === null || row.amount <= 0) continue;
    if (row.adjustment === 'discount') {
      discountAmount += row.amount;
      continue;
    }

    const sourceCost = row.sourceCost;
    const defaults =
      sourceCost && adjustmentForCost(sourceCost) === row.adjustment
        ? sourceCost
        : newCostDefaults[row.adjustment];
    costs.push({
      type: defaults.type,
      amount: row.amount,
      description: defaults.description,
      taxTreatment: row.taxTreatment ?? null,
      allocationMethod: row.allocationMethod,
      targetPurchaseLineId: row.allocationMethod === 'direct' ? row.targetPurchaseLineId : null,
    });
  }

  return { discountAmount, costs };
}

function adjustmentForCost(cost: PurchaseCostDraft): Exclude<PurchaseCostAdjustment, 'discount'> {
  const description = cost.description.trim().toLocaleLowerCase('de-DE');
  if (cost.type === 'shipping') return 'shipping';
  if (description === 'käuferschutzgebühr') return 'buyer_protection_fee';
  if (
    cost.type === 'customs' ||
    cost.type === 'import' ||
    description === 'zölle' ||
    description === 'zollgebühren'
  )
    return 'customs_fee';
  if (description === 'versicherung') return 'insurance';
  return 'other';
}
