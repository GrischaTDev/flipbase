interface RenewalOptions {
  token: string;
  paymentMethodId: number;
  url: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
}
export interface CloudIpRenewalResult {
  enabled: number;
  disabled: number;
  failed: number;
}
function record(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}
const unavailable = () => new Error('Cloud-IP-Verlängerung konnte nicht sicher geprüft werden.');
const orderPattern = /^[1-9][0-9]{0,15}$/;

/**
 * Eine genutzte IP verlängert sich automatisch, eine freigegebene läuft zum Ende der
 * bezahlten Zeit aus. Maßgeblich ist der Stand beim Anbieter, nicht eine eigene Kopie.
 */
export class IpRoyalCloudIpRenewal {
  private pending?: Promise<CloudIpRenewalResult>;
  private readonly options: RenewalOptions;
  constructor(options: RenewalOptions) {
    if (
      !options.token.trim() ||
      !options.serviceRoleKey ||
      !Number.isSafeInteger(options.paymentMethodId) ||
      options.paymentMethodId < 1
    )
      throw unavailable();
    this.options = options;
  }

  reconcile(): Promise<CloudIpRenewalResult> {
    this.pending ??= this.synchronize()
      .catch(() => {
        // Anbieter- und Datenbankantworten können private Angaben enthalten.
        throw unavailable();
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  private async database(query: string): Promise<unknown[]> {
    const base = new URL(this.options.url);
    const response = await (this.options.fetch ?? fetch)(
      `${base.origin}${base.pathname.replace(/\/$/, '')}/rest/v1/${query}`,
      {
        headers: {
          apikey: this.options.serviceRoleKey,
          Authorization: `Bearer ${this.options.serviceRoleKey}`,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw unavailable();
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length > 128) throw unavailable();
    return rows;
  }

  private provider(path: string, body?: Record<string, unknown>): Promise<Response> {
    return (this.options.fetch ?? fetch)(`https://apid.iproyal.com/v1/reseller/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'X-Access-Token': this.options.token, 'Content-Type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  private async synchronize(): Promise<CloudIpRenewalResult> {
    const inventory = await this.database(
      'marketplace_cloud_ips?select=order_reference,marketplace_cloud_setups(state)&provider=eq.iproyal&limit=129',
    );
    // Eine bezahlte IP, die noch auf ihre Kontoeinrichtung wartet, gilt als genutzt.
    const waiting = new Set(
      (
        await this.database(
          'marketplace_cloud_ip_purchases?select=provider_order_id&state=eq.ordered&limit=129',
        )
      ).map((purchase) => (record(purchase) ? purchase['provider_order_id'] : undefined)),
    );
    const result: CloudIpRenewalResult = { enabled: 0, disabled: 0, failed: 0 };
    for (const row of inventory) {
      if (
        !record(row) ||
        typeof row['order_reference'] !== 'string' ||
        !Array.isArray(row['marketplace_cloud_setups'])
      )
        throw unavailable();
      const reference = row['order_reference'];
      // Von Hand eingetragene Bestellungen ohne Anbieterkennung bleiben unberührt.
      if (!orderPattern.test(reference)) continue;
      const used =
        waiting.has(reference) ||
        row['marketplace_cloud_setups'].some(
          (setup: unknown) => record(setup) && setup['state'] !== 'cancelled',
        );
      try {
        const response = await this.provider(`orders/${reference}`);
        const order: unknown = response.ok ? await response.json() : undefined;
        const settings = record(order) ? order['auto_extend_settings'] : undefined;
        if (
          !record(order) ||
          String(order['id']) !== reference ||
          order['status'] !== 'confirmed' ||
          order['is_test'] !== false ||
          order['product_name'] !== 'ISP Dedicated' ||
          order['quantity'] !== 1 ||
          !record(settings) ||
          typeof settings['is_enabled'] !== 'boolean'
        ) {
          result.failed++;
          continue;
        }
        if (settings['is_enabled'] === used) continue;
        const changed = await this.provider('orders/toggle-auto-extend', {
          order_id: Number(reference),
          is_enabled: used,
          payment_type: 'card',
          card_id: this.options.paymentMethodId,
        });
        if (!changed.ok) result.failed++;
        else if (used) result.enabled++;
        else result.disabled++;
      } catch {
        result.failed++;
      }
    }
    return result;
  }
}
