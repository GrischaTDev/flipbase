import type { CloudSetupRequest } from './marketplace-cloud-setup-contracts.d.ts';
import { randomUUID } from 'node:crypto';

export interface CloudIpPurchaseStore {
  operation(
    action: 'inspect' | 'claim' | 'ordered' | 'failed' | 'complete' | 'reconcile',
    request: CloudSetupRequest,
    userId: string,
    fields?: { attemptId?: string; priceCents?: number; orderId?: string },
  ): Promise<{ status: string; orderId?: string }>;
}
interface PurchaseOptions {
  token: string;
  store: CloudIpPurchaseStore;
  fetch?: typeof fetch;
}
type PurchaseResult =
  'available' | 'purchase_pending' | 'purchase_failed' | 'limit_reached' | 'no_capacity';
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function positiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
const unavailable = () =>
  new Error('Cloud-IP-Nachbuchung konnte nicht sicher geprüft werden. Bitte versuche es erneut.');

/** Die Datenbank bestätigt die einmalige Kaufberechtigung vor jeder Zahlung. */
export class IpRoyalCloudIpPurchase {
  private readonly options: PurchaseOptions;
  constructor(options: PurchaseOptions) {
    this.options = options;
  }
  async ensure(request: CloudSetupRequest, userId: string): Promise<PurchaseResult> {
    try {
      const current = await this.options.store.operation('inspect', request, userId);
      if (current.status === 'ordered') return await this.checkOrder(current.orderId);
      if (
        ['available', 'purchase_pending', 'purchase_failed', 'limit_reached'].includes(
          current.status,
        )
      )
        return current.status as PurchaseResult;
      if (current.status !== 'missing') throw unavailable();
      const selection = await this.selection();
      if (!selection) return 'no_capacity';
      const quote = await this.get('orders/calculate-pricing', {
        product_id: String(selection.productId),
        product_plan_id: String(selection.planId),
        product_location_id: String(selection.locationId),
        quantity: '1',
      });
      if (!record(quote) || typeof quote['price_with_vat'] !== 'number') throw unavailable();
      const amount = quote['price_with_vat'];
      const priceCents = Math.round(amount * 100);
      if (
        !Number.isFinite(amount) ||
        amount < 0 ||
        !Number.isSafeInteger(priceCents) ||
        Math.abs(amount * 100 - priceCents) > 0.000001
      )
        throw unavailable();
      const attemptId = randomUUID();
      const claimed = await this.options.store.operation('claim', request, userId, {
        attemptId,
        priceCents,
      });
      if (claimed.status === 'ordered') return await this.checkOrder(claimed.orderId);
      if (
        ['available', 'purchase_pending', 'purchase_failed', 'limit_reached'].includes(
          claimed.status,
        )
      )
        return claimed.status as PurchaseResult;
      if (claimed.status !== 'submit') throw unavailable();
      let response: Response;
      try {
        response = await (this.options.fetch ?? fetch)(
          'https://apid.iproyal.com/v1/reseller/orders',
          {
            method: 'POST',
            headers: this.headers(),
            redirect: 'error',
            signal: AbortSignal.timeout(20_000),
            body: JSON.stringify({
              product_id: selection.productId,
              product_plan_id: selection.planId,
              product_location_id: selection.locationId,
              quantity: 1,
              auto_extend: false,
              product_question_answers: {},
            }),
          },
        );
      } catch {
        // Ein verlorenes Anbieter-ACK kann bereits bezahlt sein. Niemals erneut senden.
        return 'purchase_pending';
      }
      if (!response.ok) {
        if ([400, 401, 402, 403, 404, 422].includes(response.status)) {
          await this.options.store.operation('failed', request, userId, { attemptId });
          return 'purchase_failed';
        }
        return 'purchase_pending';
      }
      let order: unknown;
      try {
        order = await response.json();
      } catch {
        return 'purchase_pending';
      }
      if (!record(order) || !positiveId(order['id'])) return 'purchase_pending';
      const orderId = String(order['id']);
      await this.options.store.operation('ordered', request, userId, { attemptId, orderId });
      return await this.checkOrder(orderId);
    } catch {
      // Anbieterfehler können Zugangsdaten enthalten und werden nicht weitergegeben.
      throw unavailable();
    }
  }
  private headers(): Record<string, string> {
    if (!this.options.token.trim()) throw unavailable();
    return { 'X-Access-Token': this.options.token, 'Content-Type': 'application/json' };
  }
  private async get(path: string, parameters: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`https://apid.iproyal.com/v1/reseller/${path}`);
    url.search = new URLSearchParams(parameters).toString();
    const response = await (this.options.fetch ?? fetch)(url, {
      headers: this.headers(),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw unavailable();
    return response.json();
  }
  private async selection(): Promise<{
    productId: number;
    planId: number;
    locationId: number;
  } | null> {
    const response = await this.get('products');
    if (!record(response) || !Array.isArray(response['data'])) throw unavailable();
    const products = response['data'].filter(
      (value: unknown) => record(value) && value['name'] === 'ISP Dedicated',
    );
    if (products.length !== 1) return null;
    const product: unknown = products[0];
    if (
      !record(product) ||
      !positiveId(product['id']) ||
      !Array.isArray(product['plans']) ||
      !Array.isArray(product['locations']) ||
      !Array.isArray(product['questions'])
    )
      throw unavailable();
    // Unbekannte Pflichtfragen dürfen nicht mit erfundenen Angaben beantwortet werden.
    if (
      product['questions'].some(
        (value: unknown) =>
          !record(value) ||
          ![false, null, undefined].includes(value['is_required'] as false | null | undefined),
      )
    )
      throw unavailable();
    const plans = product['plans'].filter(
      (value: unknown) => record(value) && value['name'] === '30 Days',
    );
    const locations = product['locations'].filter(
      (value: unknown) => record(value) && value['name'] === 'Germany',
    );
    if (plans.length !== 1 || locations.length !== 1) return null;
    const plan: unknown = plans[0];
    const location: unknown = locations[0];
    if (
      !record(plan) ||
      !record(location) ||
      !positiveId(plan['id']) ||
      !positiveId(location['id']) ||
      !Number.isSafeInteger(plan['min_quantity']) ||
      Number(plan['min_quantity']) > 1 ||
      Number(plan['min_quantity']) < 1 ||
      !Number.isSafeInteger(plan['max_quantity']) ||
      Number(plan['max_quantity']) < 1 ||
      location['out_of_stock'] !== false ||
      (location['available_proxies_count'] !== null &&
        location['available_proxies_count'] !== undefined &&
        (!Number.isSafeInteger(location['available_proxies_count']) ||
          Number(location['available_proxies_count']) < 1))
    )
      return null;
    return { productId: product['id'], planId: plan['id'], locationId: location['id'] };
  }
  private async checkOrder(orderId: string | undefined): Promise<PurchaseResult> {
    if (!orderId || !/^[1-9][0-9]{0,15}$/.test(orderId)) throw unavailable();
    const order = await this.get(`orders/${orderId}`);
    if (!record(order) || String(order['id']) !== orderId) throw unavailable();
    if (['in-progress', 'unpaid'].includes(String(order['status']))) return 'purchase_pending';
    if (order['status'] !== 'confirmed') return 'purchase_failed';
    if (
      order['product_name'] !== 'ISP Dedicated' ||
      order['plan_name'] !== '30 Days' ||
      order['is_test'] !== false ||
      order['quantity'] !== 1 ||
      order['location'] !== 'Germany' ||
      order['locations'] !== 'Germany'
    )
      throw unavailable();
    return 'available';
  }
}
