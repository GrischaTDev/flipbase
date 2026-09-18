import { Purchase, PurchaseLine } from '../../../core/models/flipbase.models';
import {
  PURCHASE_DOCUMENT_TYPE_LABELS,
  PurchaseDocument,
} from '../../../core/models/purchase-document.models';
import { purchaseCostTypeLabel } from './purchase-cost-labels';
import { getPurchaseDisplayTitle } from './purchase-presentation';
import {
  PurchaseSellerDetailRow,
  purchaseSellerDetailRows,
  purchaseSellerLabel,
} from './purchase-seller';

export interface PurchasePrintLine {
  readonly title: string;
  readonly quantity: number;
  readonly unitPrice: number | null;
  readonly lineTotal: number | null;
}

export interface PurchasePrintCostRow {
  readonly label: string;
  readonly amount: number | null;
  readonly subtract: boolean;
}

export interface PurchasePrintDocument {
  readonly typeLabel: string;
  readonly fileName: string;
  readonly createdAt: string;
}

/** Lesbare Einkaufsübersicht; bewusst getrennt vom Prüfbeleg mit der Historie. */
export interface PurchasePrintModel {
  readonly heading: string;
  readonly title: string;
  readonly purchaseDate: string;
  readonly sellerLabel: string;
  readonly sellerRows: readonly PurchaseSellerDetailRow[];
  readonly offerUrl: string | null;
  readonly lines: readonly PurchasePrintLine[];
  readonly costRows: readonly PurchasePrintCostRow[];
  readonly total: number | null;
  readonly documents: readonly PurchasePrintDocument[];
}

export function buildPurchasePrintModel(
  purchase: Purchase,
  lines: readonly PurchaseLine[],
  documents: readonly PurchaseDocument[],
): PurchasePrintModel {
  const discount = purchase.discount_amount ?? 0;
  const costRows: PurchasePrintCostRow[] = [
    { label: 'Warenwert', amount: purchase.purchase_price, subtract: false },
  ];
  if (discount > 0) costRows.push({ label: 'Rabatt', amount: discount, subtract: true });
  if ((purchase.shipping_cost ?? 0) > 0) {
    costRows.push({ label: 'Versandkosten', amount: purchase.shipping_cost ?? 0, subtract: false });
  }
  if ((purchase.other_costs ?? 0) > 0) {
    costRows.push({ label: 'Weitere Kosten', amount: purchase.other_costs ?? 0, subtract: false });
  }
  for (const cost of purchase.costs ?? []) {
    costRows.push({
      label: cost.description || purchaseCostTypeLabel(cost.type),
      amount: Number(cost.amount),
      subtract: false,
    });
  }

  return {
    heading: getPurchaseDisplayTitle(purchase) ?? 'Einkauf',
    title: purchase.title || '',
    purchaseDate: purchase.purchase_date,
    sellerLabel: purchaseSellerLabel(purchase),
    sellerRows: purchaseSellerDetailRows(purchase),
    offerUrl: purchase.original_url ?? null,
    lines: lines.map((line) => ({
      title: line.title_snapshot,
      quantity: line.ordered_quantity,
      unitPrice: line.unit_purchase_price ?? null,
      lineTotal: line.line_total ?? null,
    })),
    costRows,
    total: purchasePrintTotal(purchase),
    documents: documents.map((document) => ({
      typeLabel: PURCHASE_DOCUMENT_TYPE_LABELS[document.document_type],
      fileName: document.original_file_name,
      createdAt: document.created_at,
    })),
  };
}

/** Gleiche Regel wie die Kostenübersicht der Detailseite; ohne Preis keine Summe. */
function purchasePrintTotal(purchase: Purchase): number | null {
  if (purchase.purchase_price === null) return null;
  if (purchase.total_purchase_cost !== undefined && purchase.total_purchase_cost !== null) {
    return purchase.total_purchase_cost;
  }
  return Number(
    (
      purchase.purchase_price -
      (purchase.discount_amount ?? 0) +
      (purchase.shipping_cost ?? 0) +
      (purchase.other_costs ?? 0) +
      (purchase.costs ?? []).reduce((sum, cost) => sum + Number(cost.amount || 0), 0)
    ).toFixed(2),
  );
}
