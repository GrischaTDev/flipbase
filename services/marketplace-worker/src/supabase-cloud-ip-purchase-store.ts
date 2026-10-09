import type { CloudIpPurchaseStore } from './iproyal-cloud-ip-purchase.ts';

/** Ausschließlich private Bestellmetadaten; keine Anbieterzugänge oder Kartendaten. */
export class SupabaseCloudIpPurchaseStore implements CloudIpPurchaseStore {
  private readonly url: string;
  private readonly key: string;
  private readonly request: typeof fetch;
  constructor(options: { url: string; serviceRoleKey: string; fetch?: typeof fetch }) {
    this.url = new URL('/rest/v1/rpc/marketplace_cloud_ip_purchase', options.url).href;
    this.key = options.serviceRoleKey;
    this.request = options.fetch ?? fetch;
  }
  async operation(
    ...args: Parameters<CloudIpPurchaseStore['operation']>
  ): ReturnType<CloudIpPurchaseStore['operation']> {
    const [action, request, userId, fields] = args;
    const response = await this.request(this.url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_action: action,
        p_workspace_id: request.workspaceId,
        p_request_id: request.requestId,
        p_connection_id: 'connectionId' in request ? request.connectionId : null,
        p_display_name: 'displayName' in request ? request.displayName : null,
        p_user_id: userId,
        p_attempt_id: fields?.attemptId ?? null,
        p_price_cents: fields?.priceCents ?? null,
        p_order_id: fields?.orderId ?? null,
      }),
    });
    const fail = () => new Error('Cloud-IP-Nachbuchung konnte nicht bestätigt werden');
    if (!response.ok) throw fail();
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw fail();
    const body = result as Record<string, unknown>;
    if (
      typeof body['status'] !== 'string' ||
      ![
        'missing',
        'submit',
        'ordered',
        'available',
        'purchase_pending',
        'purchase_failed',
        'limit_reached',
        'completed',
      ].includes(body['status']) ||
      Object.keys(body).some((key) => !['status', 'orderId'].includes(key)) ||
      (body['orderId'] !== undefined &&
        (typeof body['orderId'] !== 'string' || !/^[1-9][0-9]{0,15}$/.test(body['orderId'])))
    )
      throw fail();
    return {
      status: body['status'],
      ...(typeof body['orderId'] === 'string' ? { orderId: body['orderId'] } : {}),
    };
  }
}
