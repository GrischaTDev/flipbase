import type { OfflinePurchaseContent } from '../models/offline-purchase-draft.models';
import type { PurchaseLineDraft } from '../components/purchase-line-editor/purchase-line-editor.component';

export function offlinePurchaseNotes(
  content: Pick<OfflinePurchaseContent, 'sellerNote' | 'notes'>,
): string {
  return [
    content.sellerNote.trim() ? `Verkäufernotiz:\n${content.sellerNote.trim()}` : '',
    content.notes.trim() ? `Allgemeine Notiz:\n${content.notes.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
export function offlinePurchaseLines(
  content: OfflinePurchaseContent,
  previous: readonly PurchaseLineDraft[] = [],
): PurchaseLineDraft[] {
  return content.lines.map((line) => {
    const previousLine = previous.find((candidate) => candidate.draftId === line.lineId);
    return {
      ...previousLine,
      draftId: line.lineId,
      catalogProductId: previousLine?.catalogProductId ?? null,
      titleSnapshot: line.title,
      ean: line.ean,
      lineKind: previousLine?.lineKind ?? 'quantity',
      orderedQuantity: line.quantity,
      condition: line.condition,
      priceMode: line.unitPriceCents === null ? 'open' : 'priced',
      unitPurchasePrice: line.unitPriceCents === null ? null : line.unitPriceCents / 100,
      lineTotal: line.unitPriceCents === null ? null : (line.quantity * line.unitPriceCents) / 100,
      estimatedMarketValue: previousLine?.estimatedMarketValue ?? null,
    };
  });
}
