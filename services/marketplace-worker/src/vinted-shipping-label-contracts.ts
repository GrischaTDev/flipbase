import type {
  VintedShippingLabelErrorCode,
  VintedShippingLabelResult,
} from './vinted-browser-shipping-label.ts';

const labelUrlPattern =
  /^https:\/\/svc-shipping-labels\.s3\.eu-central-1\.amazonaws\.com\/[A-Za-z0-9/_.-]+(?:\?[^\s#]*)?$/;
const errorCodes: readonly VintedShippingLabelErrorCode[] = [
  'not_seller',
  'not_available',
  'label_choice_required',
  'address_choice_required',
  'phone_required',
  'login_required',
  'challenge_required',
  'rate_limited',
  'provider_unavailable',
];
const identifierPattern = /^[1-9][0-9]{0,31}$/;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function vintedCarrierName(shipment: unknown): string | null {
  const name = record(record(shipment)['carrier'])['name'];
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : null;
}

export function vintedShippingCarrierName(response: unknown): string | null {
  return vintedCarrierName(record(response)['label_options']);
}

export function parseVintedShippingCarrier(value: unknown) {
  const { shipmentId, name } = record(value);
  return typeof shipmentId === 'string' &&
    identifierPattern.test(shipmentId) &&
    typeof name === 'string' &&
    name.trim() &&
    name.length <= 120
    ? { shipmentId, name: name.trim() }
    : null;
}

export function shippingCarrierFromSale(body: Record<string, unknown> | null | undefined) {
  return parseVintedShippingCarrier({
    shipmentId: body?.['shipmentId'],
    name: body?.['shippingCarrierName'],
  });
}

/** Prüft, dass Flipbase ausschließlich Vinteds eigene Versandschein-Ablage herunterlädt. */
export function isVintedShippingLabelUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && labelUrlPattern.test(value);
}

/** Ergebnis aus dem Browsercontainer; bestimmt nur Dateiquelle und Anzeige, keine Schreibziele. */
export function parseVintedShippingLabelResult(input: unknown): VintedShippingLabelResult {
  const value =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : null;
  const allowed = new Set([
    'outcome',
    'errorCode',
    'transactionId',
    'shipmentId',
    'labelType',
    'carrierName',
    'labelUrl',
    'requested',
  ]);
  if (
    !value ||
    Object.keys(value).some((key) => !allowed.has(key)) ||
    !['ready', 'pending', 'failed'].includes(String(value['outcome'])) ||
    (value['errorCode'] !== undefined &&
      !errorCodes.includes(value['errorCode'] as VintedShippingLabelErrorCode)) ||
    typeof value['transactionId'] !== 'string' ||
    !identifierPattern.test(value['transactionId']) ||
    (value['shipmentId'] !== null &&
      (typeof value['shipmentId'] !== 'string' || !identifierPattern.test(value['shipmentId']))) ||
    ![null, 'printable', 'digital'].includes(value['labelType'] as string | null) ||
    (value['carrierName'] !== null &&
      (typeof value['carrierName'] !== 'string' || value['carrierName'].length > 120)) ||
    (value['labelUrl'] !== null && !isVintedShippingLabelUrl(value['labelUrl'])) ||
    typeof value['requested'] !== 'boolean' ||
    (value['outcome'] === 'ready' && (value['labelUrl'] === null || value['shipmentId'] === null))
  )
    throw new Error('Ungültiges Versandschein-Ergebnis');
  return value as unknown as VintedShippingLabelResult;
}
