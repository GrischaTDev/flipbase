import type {
  OfflinePurchaseContent,
  OfflinePurchaseDraft,
} from '../models/offline-purchase-draft.models';

export function isOfflineIdentifier(identifier: unknown): identifier is string {
  return (
    typeof identifier === 'string' &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(identifier)
  );
}
export function validateOfflineContent(content: OfflinePurchaseContent): void {
  const boundedText = (text: unknown, maximum: number) =>
    typeof text === 'string' && text.length <= maximum;
  if (
    !content ||
    !boundedText(content.draftName, 200) ||
    !boundedText(content.sellerNote, 2000) ||
    !boundedText(content.notes, 10000) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(content.purchaseDate) ||
    new Date(content.purchaseDate + 'T12:00:00Z').toISOString().slice(0, 10) !==
      content.purchaseDate ||
    !Array.isArray(content.lines) ||
    content.lines.length > 100
  )
    throw new Error('Bitte prüfe Datum, Texte und höchstens 100 Positionen.');
  const lineIds = new Set<string>();
  for (const line of content.lines) {
    if (
      !line ||
      !isOfflineIdentifier(line.lineId) ||
      lineIds.has(line.lineId) ||
      !boundedText(line.title, 500) ||
      (line.ean !== null && !/^[0-9]{8,14}$/.test(line.ean)) ||
      !['new', 'like_new', 'very_good', 'used', 'heavily_used', 'defective'].includes(
        line.condition,
      ) ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 100000 ||
      (line.unitPriceCents !== null &&
        (!Number.isSafeInteger(line.unitPriceCents) ||
          line.unitPriceCents < 0 ||
          !Number.isSafeInteger(line.unitPriceCents * line.quantity)))
    )
      throw new Error('Bitte prüfe Titel, EAN, Zustand, Menge und den Preis in ganzen Cent.');
    lineIds.add(line.lineId);
  }
}
export function validateOfflineDraft(draft: OfflinePurchaseDraft): void {
  if (
    !draft ||
    draft.schemaVersion !== 1 ||
    !isOfflineIdentifier(draft.userId) ||
    !isOfflineIdentifier(draft.workspaceId) ||
    !isOfflineIdentifier(draft.draftId) ||
    !isOfflineIdentifier(draft.requestId) ||
    !Number.isSafeInteger(draft.revision) ||
    draft.revision < 1 ||
    !['local', 'review_required', 'transferring', 'outcome_unknown', 'transferred'].includes(
      draft.state,
    ) ||
    (draft.purchaseId !== null && !isOfflineIdentifier(draft.purchaseId))
  )
    throw new Error('Dieser lokale Entwurf hat ein unbekanntes oder beschädigtes Format.');
  validateOfflineContent(draft.content);
}
