import type { PurchaseLineDraft } from '../components/purchase-line-editor/purchase-line-editor.component';

export function purchaseLineStructureFingerprint(lines: readonly PurchaseLineDraft[]): string {
  return JSON.stringify(
    lines.map((line) => [
      line.draftId ?? null,
      line.catalogProductId,
      line.titleSnapshot,
      line.lineKind,
      line.orderedQuantity,
    ]),
  );
}
