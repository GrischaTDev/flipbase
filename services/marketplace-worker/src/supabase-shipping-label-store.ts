import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type { VintedShippingLabelResult } from './vinted-browser-shipping-label.ts';
import { isVintedShippingLabelUrl } from './vinted-shipping-label-contracts.ts';

interface ShippingLabelStoreOptions {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
}

export interface ShippingLabelSale {
  readonly accountId: string;
  readonly transactionId: string;
  readonly externalConversationId: string;
  readonly title: string;
}

export interface StoredShippingLabel {
  readonly id: string;
  readonly storagePath: string;
  readonly mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
  readonly byteSize: number;
  readonly labelType: 'printable' | 'digital' | null;
  readonly carrierName: string | null;
  readonly requestedByFlipbase: boolean;
  readonly fetchedAt: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifierPattern = /^[1-9][0-9]{0,31}$/;
const maxLabelBytes = 10 * 1024 * 1024;
const extensions = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
} as const;

export class ShippingLabelUnavailableError extends Error {}

/** Erkennt die Dateiart am Inhalt; die Angabe des Absenders allein genügt nicht. */
export function shippingLabelMimeType(bytes: Uint8Array): StoredShippingLabel['mimeType'] | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  return null;
}

/**
 * Liest den Verkauf mit den Rechten der anfragenden Person und legt Versandscheine ausschließlich
 * mit dem Serverschlüssel des Workers ab.
 */
export class SupabaseShippingLabelStore {
  private readonly baseUrl: string;
  private readonly publishableKey: string;
  private readonly serviceRoleKey: string;
  private readonly request: typeof fetch;

  constructor(options: ShippingLabelStoreOptions) {
    if (!options.publishableKey || !options.serviceRoleKey) throw new Error('Serverzugang fehlt');
    this.baseUrl = options.url.replace(/\/$/, '');
    this.publishableKey = options.publishableKey;
    this.serviceRoleKey = options.serviceRoleKey;
    this.request = options.fetch ?? fetch;
  }

  async sale(scope: BrowserSessionScope, saleId: string): Promise<ShippingLabelSale> {
    if (!uuidPattern.test(saleId)) throw new ShippingLabelUnavailableError();
    const connectionUrl = new URL('/rest/v1/marketplace_connections', this.baseUrl);
    connectionUrl.searchParams.set('select', 'external_account_id,status,execution_mode');
    connectionUrl.searchParams.set('workspace_id', `eq.${scope.workspaceId}`);
    connectionUrl.searchParams.set('id', `eq.${scope.connectionId}`);
    connectionUrl.searchParams.set('marketplace', 'eq.vinted');
    const [connection, ...otherConnections] = await this.userRows(connectionUrl, scope);
    const accountId = connection?.['external_account_id'];
    if (
      otherConnections.length ||
      connection?.['status'] !== 'connected' ||
      connection['execution_mode'] !== 'cloud' ||
      typeof accountId !== 'string' ||
      !identifierPattern.test(accountId)
    )
      throw new ShippingLabelUnavailableError();
    const saleUrl = new URL('/rest/v1/marketplace_account_entries', this.baseUrl);
    saleUrl.searchParams.set('select', 'external_id,body');
    saleUrl.searchParams.set('workspace_id', `eq.${scope.workspaceId}`);
    saleUrl.searchParams.set('connection_id', `eq.${scope.connectionId}`);
    saleUrl.searchParams.set('kind', 'eq.sale');
    saleUrl.searchParams.set('id', `eq.${saleId}`);
    const [sale, ...otherSales] = await this.userRows(saleUrl, scope);
    const body =
      sale?.['body'] && typeof sale['body'] === 'object' && !Array.isArray(sale['body'])
        ? (sale['body'] as Record<string, unknown>)
        : {};
    const transactionId = sale?.['external_id'];
    const conversationId = body['externalConversationId'];
    if (
      otherSales.length ||
      typeof transactionId !== 'string' ||
      !identifierPattern.test(transactionId) ||
      typeof conversationId !== 'string' ||
      !identifierPattern.test(conversationId) ||
      (body['sellerId'] !== undefined && body['sellerId'] !== accountId) ||
      !['sold', 'shipped'].includes(String(body['saleState']))
    )
      throw new ShippingLabelUnavailableError();
    const title =
      typeof body['title'] === 'string' && body['title'].trim()
        ? body['title'].trim().slice(0, 500)
        : 'Verkauf';
    return { accountId, transactionId, externalConversationId: conversationId, title };
  }

  async save(
    scope: BrowserSessionScope,
    sale: ShippingLabelSale,
    result: VintedShippingLabelResult,
  ): Promise<StoredShippingLabel> {
    if (
      result.outcome !== 'ready' ||
      result.transactionId !== sale.transactionId ||
      !result.shipmentId ||
      !isVintedShippingLabelUrl(result.labelUrl)
    )
      throw new Error('Kein abholbereiter Versandschein');
    const download = await this.request(result.labelUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    if (!download.ok) throw new Error('Versandschein nicht abrufbar');
    const announced = Number(download.headers.get('content-length'));
    if (Number.isFinite(announced) && announced > maxLabelBytes)
      throw new Error('Versandschein zu groß');
    const bytes = new Uint8Array(await download.arrayBuffer());
    const mimeType = shippingLabelMimeType(bytes);
    if (!mimeType || bytes.byteLength > maxLabelBytes)
      throw new Error('Unbekannte Versandscheindatei');
    const storagePath = `${scope.workspaceId}/${scope.connectionId}/${sale.transactionId}.${extensions[mimeType]}`;
    const upload = await this.request(
      new URL(`/storage/v1/object/marketplace-shipping-labels/${storagePath}`, this.baseUrl),
      {
        method: 'POST',
        headers: {
          ...this.serviceHeaders(),
          'Content-Type': mimeType,
          'x-upsert': 'true',
        },
        body: bytes,
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!upload.ok) throw new Error('Versandschein nicht gespeichert');
    const rowUrl = new URL('/rest/v1/marketplace_shipping_labels', this.baseUrl);
    rowUrl.searchParams.set('on_conflict', 'workspace_id,connection_id,external_transaction_id');
    rowUrl.searchParams.set(
      'select',
      'id,storage_path,mime_type,byte_size,label_type,carrier_name,requested_by_flipbase,fetched_at',
    );
    const fetchedAt = new Date().toISOString();
    const row = await this.request(rowUrl, {
      method: 'POST',
      headers: {
        ...this.serviceHeaders(),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        workspace_id: scope.workspaceId,
        connection_id: scope.connectionId,
        external_transaction_id: sale.transactionId,
        external_shipment_id: result.shipmentId,
        external_conversation_id: sale.externalConversationId,
        title: sale.title,
        storage_path: storagePath,
        mime_type: mimeType,
        byte_size: bytes.byteLength,
        fetched_at: fetchedAt,
        // Ein späteres Abholen überschreibt weder Anforderungsherkunft noch bekannte Angaben.
        ...(result.requested ? { requested_by_flipbase: true } : {}),
        ...(result.labelType ? { label_type: result.labelType } : {}),
        ...(result.carrierName ? { carrier_name: result.carrierName } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!row.ok) throw new Error('Versandschein nicht eingetragen');
    const [saved] = (await row.json()) as Record<string, unknown>[];
    if (!saved) throw new Error('Versandschein nicht eingetragen');
    return {
      id: String(saved['id']),
      storagePath,
      mimeType,
      byteSize: bytes.byteLength,
      labelType: (saved['label_type'] as StoredShippingLabel['labelType']) ?? null,
      carrierName: typeof saved['carrier_name'] === 'string' ? saved['carrier_name'] : null,
      requestedByFlipbase: saved['requested_by_flipbase'] === true,
      fetchedAt: typeof saved['fetched_at'] === 'string' ? saved['fetched_at'] : fetchedAt,
    };
  }

  private serviceHeaders(): Record<string, string> {
    return { apikey: this.serviceRoleKey, Authorization: `Bearer ${this.serviceRoleKey}` };
  }

  private async userRows(url: URL, scope: BrowserSessionScope) {
    const response = await this.request(url, {
      headers: { apikey: this.publishableKey, Authorization: `Bearer ${scope.userAccessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new ShippingLabelUnavailableError();
    const value: unknown = await response.json();
    if (
      !Array.isArray(value) ||
      value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))
    )
      throw new ShippingLabelUnavailableError();
    return value as Record<string, unknown>[];
  }
}
