/** Private Kopie eines Vinted-Versandscheins, gekoppelt an einen Verkauf (Vinted-Transaktion). */
export interface VintedShippingLabel {
  readonly id: string;
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly transactionId: string;
  readonly conversationId: string | null;
  readonly title: string;
  readonly carrierName: string | null;
  readonly labelType: 'printable' | 'digital' | null;
  readonly storagePath: string;
  readonly mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
  readonly requestedByFlipbase: boolean;
  readonly fetchedAt: string;
}

export type VintedShippingLabelRequestResult =
  | { readonly outcome: 'ready'; readonly requested: boolean }
  | { readonly outcome: 'pending'; readonly requested: boolean }
  | { readonly outcome: 'failed'; readonly requested: boolean; readonly errorCode: string };

const identifierPattern = /^[1-9][0-9]{0,31}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mimeTypes = ['application/pdf', 'image/png', 'image/jpeg'] as const;

export function parseVintedShippingLabelRow(row: unknown): VintedShippingLabel | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const value = row as Record<string, unknown>;
  const id = value['id'];
  const fetchedAt = value['fetched_at'];
  if (
    (typeof id !== 'number' && typeof id !== 'string') ||
    typeof value['workspace_id'] !== 'string' ||
    !uuidPattern.test(value['workspace_id']) ||
    typeof value['connection_id'] !== 'string' ||
    !uuidPattern.test(value['connection_id']) ||
    typeof value['external_transaction_id'] !== 'string' ||
    !identifierPattern.test(value['external_transaction_id']) ||
    typeof value['storage_path'] !== 'string' ||
    !value['storage_path'] ||
    !mimeTypes.includes(value['mime_type'] as (typeof mimeTypes)[number]) ||
    typeof fetchedAt !== 'string' ||
    !Number.isFinite(Date.parse(fetchedAt))
  )
    return null;
  const conversationId = value['external_conversation_id'];
  return {
    id: String(id),
    workspaceId: value['workspace_id'],
    connectionId: value['connection_id'],
    transactionId: value['external_transaction_id'],
    conversationId:
      typeof conversationId === 'string' && identifierPattern.test(conversationId)
        ? conversationId
        : null,
    title:
      typeof value['title'] === 'string' && value['title'].trim()
        ? value['title'].trim()
        : 'Verkauf',
    carrierName:
      typeof value['carrier_name'] === 'string' && value['carrier_name'].trim()
        ? value['carrier_name'].trim()
        : null,
    labelType:
      value['label_type'] === 'printable' || value['label_type'] === 'digital'
        ? value['label_type']
        : null,
    storagePath: value['storage_path'],
    mimeType: value['mime_type'] as VintedShippingLabel['mimeType'],
    requestedByFlipbase: value['requested_by_flipbase'] === true,
    fetchedAt,
  };
}

/** Dateiname für den Download, z. B. „Versandschein-24052549356.pdf“. */
export function vintedShippingLabelFileName(label: VintedShippingLabel): string {
  const extension =
    label.mimeType === 'application/pdf' ? 'pdf' : label.mimeType === 'image/png' ? 'png' : 'jpg';
  return `Versandschein-${label.transactionId}.${extension}`;
}

export function vintedShippingLabelTypeLabel(label: VintedShippingLabel): string {
  if (label.labelType === 'digital' || label.mimeType !== 'application/pdf') return 'QR-Code';
  return 'Druckfertig';
}

/** Verständliche Meldungen zu den Fehlercodes des Workers. */
export function vintedShippingLabelErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'label_choice_required':
      return 'Für diesen Verkauf bietet Vinted mehrere Versandwege an. Fordere den Versandschein bitte direkt bei Vinted an.';
    case 'address_choice_required':
      return 'Im Vinted-Konto ist keine eindeutige Absenderadresse hinterlegt. Fordere den Versandschein bitte direkt bei Vinted an.';
    case 'phone_required':
      return 'Vinted verlangt für diesen Versand eine Telefonnummer. Hinterlege sie im Vinted-Konto und versuche es erneut.';
    case 'not_available':
      return 'Für diesen Verkauf bietet Vinted gerade keinen Versandschein an.';
    case 'not_seller':
      return 'Dieser Vorgang gehört nicht zu einem eigenen Verkauf.';
    case 'login_required':
      return 'Das Vinted-Konto ist abgemeldet. Melde es in der Kontoverwaltung neu an.';
    case 'challenge_required':
      return 'Vinted verlangt eine Bestätigung. Öffne die Browseransicht des Kontos.';
    case 'rate_limited':
      return 'Vinted begrenzt gerade die Anfragen. Versuche es in einigen Minuten erneut.';
    default:
      return 'Der Versandschein konnte nicht abgerufen werden. Versuche es erneut.';
  }
}
