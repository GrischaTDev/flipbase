import type { SaleTarget } from '../../../core/models/sale-target.models';
import type { RecordSaleInput } from '../../../core/services/sales.service';
import type { ExternalSaleEntryDraft } from '../models/external-sale-entry.models';
import type {
  EbayOrderBookRequest,
  EbayOrderReview,
  EbaySaleTarget,
} from '../../../../../supabase/functions/_shared/ebay-order-import-contracts';
import {
  MAX_EBAY_CENTS,
  splitEbayLineAmount,
} from '../../../../../supabase/functions/_shared/ebay-order-amounts';

function berlinSaleDate(createdAt: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(createdAt));
  return ['year', 'month', 'day']
    .map((name) => parts.find((part) => part.type === name)?.value)
    .join('-');
}
export function buildEbaySaleEntryDraft(
  review: EbayOrderReview,
  resolveTarget: (target: EbaySaleTarget, title: string) => SaleTarget,
): ExternalSaleEntryDraft | null {
  const source = review.source;
  if (
    source.blockers.length ||
    source.currency !== 'EUR' ||
    source.shippingRevenueCents === null ||
    source.totalCents === null ||
    source.lines.length === 0 ||
    !Number.isFinite(Date.parse(source.createdAt))
  )
    return null;
  try {
    const lines = source.lines.flatMap((line) => {
      if (!line.lineItemId || line.goodsCents === null || line.quantity === null)
        throw new Error('Incomplete source');
      const mapping = review.assignments.find(
        (assignment) => assignment.lineItemId === line.lineItemId,
      );
      return splitEbayLineAmount(line.goodsCents, line.quantity).map((group) => ({
        sourceLineId: line.lineItemId as string,
        title: line.title,
        quantity: group.quantity,
        unitSalePrice: group.unitCents / 100,
        target: mapping ? resolveTarget(mapping.target, line.title) : null,
      }));
    });
    return {
      revision: `${review.reviewHash}:${review.snapshotId}`,
      platform: 'ebay',
      saleDate: berlinSaleDate(source.createdAt),
      externalOrderId: source.orderId,
      shippingRevenue: source.shippingRevenueCents / 100,
      lines,
      requireConfirmedCosts: true,
    };
  } catch {
    return null;
  }
}
function confirmedCents(value: number | undefined): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    Number(value.toFixed(2)) !== value
  )
    throw new Error(
      'Bestätige alle Kosten mit vollständigen Centbeträgen, auch wenn sie 0 € betragen.',
    );
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents > MAX_EBAY_CENTS)
    throw new Error('Der Kostenbetrag ist zu groß.');
  return cents;
}
export function buildEbayOrderBookRequest(
  review: EbayOrderReview,
  draft: ExternalSaleEntryDraft,
  input: RecordSaleInput,
): EbayOrderBookRequest {
  if (
    input.platform !== draft.platform ||
    input.saleDate !== draft.saleDate ||
    input.externalOrderId !== draft.externalOrderId ||
    input.shippingRevenue !== draft.shippingRevenue ||
    input.lines.length !== draft.lines.length
  )
    throw new Error('Die Bestellangaben wurden verändert. Lade die Bestellung erneut.');
  const assignments = new Map<string, EbaySaleTarget>();
  input.lines.forEach((line, index) => {
    const source = draft.lines[index];
    const catalog = typeof line.catalogProductId === 'string' && line.catalogProductId.length > 0;
    const inventory = typeof line.inventoryItemId === 'string' && line.inventoryItemId.length > 0;
    if (
      line.quantity !== source.quantity ||
      line.unitSalePrice !== source.unitSalePrice ||
      catalog === inventory
    )
      throw new Error(
        'Prüfe die Artikelzuordnung. Mengen und Preise bleiben an die Bestellung gebunden.',
      );
    const target: EbaySaleTarget = catalog
      ? { catalogProductId: line.catalogProductId as string }
      : { inventoryItemId: line.inventoryItemId as string };
    const previous = assignments.get(source.sourceLineId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(target))
      throw new Error('Die Preisgruppen einer Bestellposition müssen denselben Artikel verwenden.');
    assignments.set(source.sourceLineId, target);
  });
  const extra = input.additionalCosts ?? [];
  if (
    extra.length > 50 ||
    extra.some(
      (cost) =>
        !['packaging', 'payment_fee', 'promotion', 'other'].includes(cost.category) ||
        (cost.description !== null &&
          cost.description !== undefined &&
          cost.description.length > 500),
    )
  )
    throw new Error('Prüfe die zusätzlichen Kosten und ihre Beschreibung.');
  if (
    input.shippingMode !== undefined &&
    input.shippingMode !== null &&
    !['seller_arranged', 'platform_prepaid', 'pickup'].includes(input.shippingMode)
  )
    throw new Error('Prüfe die Versandabwicklung.');
  return {
    workspaceId: review.workspaceId,
    connectionId: review.connectionId,
    orderId: review.source.orderId,
    snapshotId: review.snapshotId,
    reviewHash: review.reviewHash,
    assignments: [...assignments].map(([lineItemId, target]) => ({ lineItemId, target })),
    costs: {
      platformFeeCents: confirmedCents(input.platformFee),
      shippingCostCents: confirmedCents(input.shippingCost),
      shippingMode: input.shippingMode ?? null,
      additionalCosts: extra.map((cost) => ({
        category: cost.category,
        description: cost.description?.trim() || null,
        amountCents: confirmedCents(cost.amount),
      })),
    },
  };
}
