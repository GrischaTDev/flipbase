import type { Page } from 'playwright';
import { readVintedCsrfToken } from './vinted-browser-messages.ts';
import { isVintedShippingLabelUrl } from './vinted-shipping-label-contracts.ts';

export { isVintedShippingLabelUrl };

/**
 * Versandschein eines eigenen Vinted-Verkaufs anfordern oder einen vorhandenen abholen.
 * Ablauf am 08.11.2026 im Cloud-Browser gemessen: `label_options` liefert Versanddienst,
 * Abgabeweg und Schein-Arten; `PUT /transactions/{id}/shipment/order` fordert an;
 * `label_url` liefert danach einen sieben Tage gültigen S3-Link.
 */
export type VintedShippingLabelErrorCode =
  | 'not_seller'
  | 'not_available'
  | 'label_choice_required'
  | 'address_choice_required'
  | 'phone_required'
  | 'login_required'
  | 'challenge_required'
  | 'rate_limited'
  | 'provider_unavailable';

export interface VintedShippingLabelResult {
  readonly outcome: 'ready' | 'pending' | 'failed';
  readonly errorCode?: VintedShippingLabelErrorCode;
  readonly transactionId: string;
  readonly shipmentId: string | null;
  readonly labelType: 'printable' | 'digital' | null;
  readonly carrierName: string | null;
  readonly labelUrl: string | null;
  readonly requested: boolean;
}

export interface VintedShippingLabelAdapter {
  read(path: string): Promise<unknown>;
  write(path: string, method: 'PUT', body: Record<string, unknown>): Promise<unknown>;
  authorize(): Promise<void>;
  wait(milliseconds: number): Promise<void>;
}

export class VintedShippingLabelError extends Error {
  readonly code: VintedShippingLabelErrorCode;
  constructor(code: VintedShippingLabelErrorCode) {
    super(code);
    this.code = code;
  }
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const identifier = (value: unknown): string | null => {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === 'string' && /^[1-9][0-9]{0,31}$/.test(text) ? text : null;
};
const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : null;
export async function executeVintedShippingLabel(
  adapter: VintedShippingLabelAdapter,
  accountId: string,
  externalConversationId: string,
  transactionId: string,
): Promise<VintedShippingLabelResult> {
  const result = (
    outcome: VintedShippingLabelResult['outcome'],
    values: Partial<VintedShippingLabelResult> = {},
  ): VintedShippingLabelResult => ({
    outcome,
    transactionId,
    shipmentId: null,
    labelType: null,
    carrierName: null,
    labelUrl: null,
    requested: false,
    ...values,
  });
  if (!identifier(accountId) || !identifier(externalConversationId) || !identifier(transactionId))
    return result('failed', { errorCode: 'not_available' });
  try {
    const conversation = record(
      record(await adapter.read(`/api/v2/conversations/${externalConversationId}`))['conversation'],
    );
    const relation = record(conversation['transaction']);
    const sellerId = relation['seller_id'];
    if (
      identifier(relation['id']) !== transactionId ||
      relation['current_user_side'] !== 'seller' ||
      (sellerId != null && identifier(sellerId) !== accountId)
    )
      return result('failed', { errorCode: 'not_seller' });
    const shipmentId = identifier(relation['shipment_id']);
    if (!shipmentId) return result('failed', { errorCode: 'not_available' });
    const actions = new Set(
      (Array.isArray(relation['available_actions']) ? relation['available_actions'] : []).filter(
        (action): action is string => typeof action === 'string',
      ),
    );
    let requested = false;
    let labelType: VintedShippingLabelResult['labelType'] = null;
    let carrierName: string | null = null;
    if (actions.has('order_shipping_label')) {
      const options = record(
        record(await adapter.read(`/api/v2/shipments/${shipmentId}/label_options`))[
          'label_options'
        ],
      );
      const dropOffs = (Array.isArray(options['drop_offs']) ? options['drop_offs'] : []).flatMap(
        (dropOff) => {
          const choices = record(dropOff)['options'];
          return Array.isArray(choices) ? choices.map(record) : [];
        },
      );
      // Mehrere Abgabewege brauchen eine Auswahl, die Flipbase noch nicht abfragt.
      if (dropOffs.length !== 1) return result('failed', { errorCode: 'label_choice_required' });
      const types = Array.isArray(dropOffs[0]!['label_types']) ? dropOffs[0]!['label_types'] : [];
      // Gewünscht: wann immer möglich den druckfertigen Schein, sonst den digitalen QR-Code.
      labelType = types.includes('printable')
        ? 'printable'
        : types.includes('digital')
          ? 'digital'
          : null;
      if (!labelType) return result('failed', { errorCode: 'label_choice_required' });
      const sender = record(options['sender']);
      if (sender['phone_number_requirement'] === 'mandatory' && !text(sender['phone_number']))
        return result('failed', { errorCode: 'phone_required' });
      carrierName = text(record(options['carrier'])['name']);
      const addresses = record(await adapter.read('/api/v2/user_addresses'))['user_addresses'];
      const list = Array.isArray(addresses) ? addresses.map(record) : [];
      const shipping = list.filter((address) => address['entry_type'] === 2);
      const address = list.length === 1 ? list[0] : shipping.length === 1 ? shipping[0] : null;
      const addressId = Number(identifier(address?.['id']));
      if (!Number.isSafeInteger(addressId) || addressId <= 0)
        return result('failed', { errorCode: 'address_choice_required' });
      await adapter.authorize();
      await adapter.write(`/api/v2/transactions/${transactionId}/shipment/order`, 'PUT', {
        seller_address_id: addressId,
        drop_off_type: null,
        label_type: labelType,
      });
      requested = true;
    } else if (!actions.has('send_shipping_label'))
      return result('failed', { shipmentId, errorCode: 'not_available' });
    // Vinted erstellt den Schein nach der Anforderung mit kurzer Verzögerung.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const labelUrl = record(await adapter.read(`/api/v2/shipments/${shipmentId}/label_url`))[
        'label_url'
      ];
      if (isVintedShippingLabelUrl(labelUrl))
        return result('ready', { shipmentId, labelType, carrierName, labelUrl, requested });
      await adapter.wait(1500);
    }
    return result('pending', { shipmentId, labelType, carrierName, requested });
  } catch (error) {
    return result('failed', {
      errorCode: error instanceof VintedShippingLabelError ? error.code : 'provider_unavailable',
    });
  }
}

/** Führt den Ablauf in der angemeldeten Vinted-Seite des Cloud-Browsers aus. */
export async function requestVintedShippingLabel(
  page: Page,
  accountId: string,
  externalConversationId: string,
  transactionId: string,
  authorize: () => Promise<void>,
): Promise<VintedShippingLabelResult> {
  async function request(path: string, method: 'GET' | 'PUT', body?: Record<string, unknown>) {
    await authorize();
    if (new URL(page.url()).origin !== 'https://www.vinted.de')
      throw new VintedShippingLabelError('login_required');
    const token = method === 'GET' ? null : await readVintedCsrfToken(page);
    if (method !== 'GET' && !token) throw new VintedShippingLabelError('login_required');
    const response = await page.evaluate(
      async ({ path, method, body, token }) => {
        if (location.origin !== 'https://www.vinted.de') return { status: 401, payload: null };
        const response = await fetch(path, {
          method,
          credentials: 'include',
          redirect: 'error',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            ...(token ? { 'X-CSRF-Token': token } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(10000),
        });
        return {
          status: response.status,
          payload: response.headers.get('content-type')?.includes('application/json')
            ? await response.json().catch(() => null)
            : null,
        };
      },
      { path, method, body, token },
    );
    if (response.status < 200 || response.status >= 300 || response.payload === null)
      throw new VintedShippingLabelError(
        response.status === 401
          ? 'login_required'
          : response.status === 403
            ? 'challenge_required'
            : response.status === 429
              ? 'rate_limited'
              : 'provider_unavailable',
      );
    return response.payload as unknown;
  }
  return executeVintedShippingLabel(
    {
      read: (path) => request(path, 'GET'),
      write: (path, method, body) => request(path, method, body),
      authorize,
      wait: (milliseconds) => page.waitForTimeout(milliseconds),
    },
    accountId,
    externalConversationId,
    transactionId,
  );
}
