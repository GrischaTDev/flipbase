import { Injectable, inject } from '@angular/core';
import JSZip from 'jszip';
import {
  AuditExportManifest,
  BusinessEvent,
  BusinessEventFilter,
} from '../models/business-event.models';
import { Database } from '../models/supabase.types';
import { mapBusinessEventLabel } from './business-event.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';

type ArchiveRow = Readonly<Record<string, unknown>>;
type ArchiveTableName =
  | 'purchases'
  | 'purchase_lines'
  | 'purchase_costs'
  | 'inventory_items'
  | 'stock_lots'
  | 'stock_movements'
  | 'sales'
  | 'sale_lines'
  | 'sale_cost_entries'
  | 'item_costs'
  | 'sale_line_lot_allocations';

export interface AuditArchiveData {
  readonly businessEvents: readonly BusinessEvent[];
  readonly purchases: readonly ArchiveRow[];
  readonly purchaseLines: readonly ArchiveRow[];
  readonly purchaseCosts: readonly ArchiveRow[];
  readonly inventoryItems: readonly ArchiveRow[];
  readonly itemCosts: readonly ArchiveRow[];
  readonly stockLots: readonly ArchiveRow[];
  readonly stockMovements: readonly ArchiveRow[];
  readonly sales: readonly ArchiveRow[];
  readonly saleLines: readonly ArchiveRow[];
  readonly saleCosts: readonly ArchiveRow[];
  readonly saleLineLotAllocations: readonly ArchiveRow[];
}

export interface AuditArchiveOptions {
  readonly workspaceId: string;
  readonly createdAt: string;
  readonly filters: Readonly<Record<string, string | number | null>>;
}

export interface AuditArchiveResult {
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly manifest: AuditExportManifest;
}

export interface AuditArchiveRequest extends Omit<BusinessEventFilter, 'cursor'> {
  readonly signal?: AbortSignal;
  readonly onProgress?: (percent: number) => void;
}

const ARCHIVE_TABLES = {
  purchases: 'purchases',
  purchaseLines: 'purchase_lines',
  purchaseCosts: 'purchase_costs',
  inventoryItems: 'inventory_items',
  itemCosts: 'item_costs',
  stockLots: 'stock_lots',
  stockMovements: 'stock_movements',
  sales: 'sales',
  saleLines: 'sale_lines',
  saleCosts: 'sale_cost_entries',
  saleLineLotAllocations: 'sale_line_lot_allocations',
} as const;

const ARCHIVE_HEADERS = {
  purchases: [
    'id',
    'cost_allocation_mode',
    'created_at',
    'entry_status',
    'estimated_delivery',
    'finalized_at',
    'finalized_by',
    'notes',
    'original_url',
    'purchase_date',
    'purchase_price',
    'receiving_status',
    'source_id',
    'supplier_id',
    'title',
    'total_purchase_cost',
    'tracking_carrier',
    'tracking_number',
    'tracking_status',
    'type',
    'updated_at',
    'workspace_id',
  ],
  purchaseLines: [
    'id',
    'allocated_additional_cost',
    'allocated_total_cost',
    'catalog_product_id',
    'condition_snapshot',
    'created_at',
    'estimated_market_value',
    'line_kind',
    'line_total',
    'ordered_quantity',
    'price_mode',
    'purchase_id',
    'received_quantity',
    'title_snapshot',
    'unit_purchase_price',
    'updated_at',
    'workspace_id',
  ],
  purchaseCosts: [
    'id',
    'allocation_method',
    'amount',
    'created_at',
    'description',
    'purchase_id',
    'target_purchase_line_id',
    'type',
    'workspace_id',
  ],
  inventoryItems: [
    'id',
    'allocated_purchase_cost',
    'brand',
    'category',
    'condition',
    'created_at',
    'description',
    'dimension_height_cm',
    'dimension_length_cm',
    'dimension_width_cm',
    'ean',
    'expected_value',
    'is_public_store',
    'model',
    'purchase_id',
    'purchase_line_id',
    'sku',
    'status',
    'tax_mode_override',
    'title',
    'updated_at',
    'weight_g',
    'workspace_id',
  ],
  itemCosts: ['id', 'inventory_item_id', 'type', 'amount', 'description', 'created_at'],
  stockLots: [
    'id',
    'catalog_product_id',
    'created_at',
    'purchase_id',
    'purchase_line_id',
    'received_at',
    'received_quantity',
    'remaining_quantity',
    'unit_cost',
    'workspace_id',
  ],
  stockMovements: [
    'id',
    'created_at',
    'direction',
    'quantity',
    'reason',
    'sale_line_id',
    'stock_lot_id',
    'workspace_id',
  ],
  sales: [
    'id',
    'buyer_notes',
    'created_at',
    'external_listing_id',
    'external_order_id',
    'inventory_item_id',
    'other_costs',
    'packaging_cost',
    'platform',
    'platform_fee',
    'refund_amount',
    'returned_at',
    'sale_date',
    'sale_price',
    'sale_price_total',
    'shipping_cost',
    'shipping_mode',
    'shipping_revenue',
    'void_reason',
    'voided_at',
    'voided_by',
    'workspace_id',
  ],
  saleLines: [
    'id',
    'catalog_product_id',
    'cost_of_goods_sold',
    'created_at',
    'inventory_item_id',
    'line_total',
    'quantity',
    'sale_id',
    'tax_mode',
    'title_snapshot',
    'unit_sale_price',
    'workspace_id',
  ],
  saleCosts: ['id', 'amount', 'category', 'created_at', 'description', 'sale_id', 'workspace_id'],
  saleLineLotAllocations: [
    'id',
    'workspace_id',
    'sale_line_id',
    'stock_lot_id',
    'quantity',
    'unit_cost',
    'allocated_cost',
    'active_allocated_cost',
    'created_at',
  ],
} as const satisfies {
  [
    K in keyof typeof ARCHIVE_TABLES
  ]: readonly (keyof Database['public']['Tables'][(typeof ARCHIVE_TABLES)[K]]['Row'])[];
};

const BUSINESS_EVENT_HEADERS = [
  'id',
  'workspace_id',
  'entity_type',
  'entity_id',
  'event_type',
  'actor_id',
  'reason',
  'changes_json',
  'correlation_id',
  'created_at',
] as const;

export function escapeAuditCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const protectedValue = /^[=+\-@\t\r]/u.test(serialized) ? `'${serialized}` : serialized;
  const escaped = protectedValue.replaceAll('"', '""');
  return /[;"\r\n]/u.test(escaped) ? `"${escaped}"` : escaped;
}

function rowsToCsv(rows: readonly ArchiveRow[], headers: readonly string[]): string {
  const lines = rows.map((row) =>
    headers.map((header) => escapeAuditCsvCell(row[header])).join(';'),
  );
  return `\uFEFF${headers.join(';')}\r\n${lines.join('\r\n')}`;
}

function eventToArchiveRow(event: BusinessEvent): ArchiveRow {
  return {
    id: event.id,
    workspace_id: event.workspaceId,
    entity_type: event.entityType,
    entity_id: event.entityId,
    event_type: event.eventType,
    actor_id: event.actorId,
    reason: event.reason,
    changes_json: event.changes,
    correlation_id: event.correlationId,
    created_at: event.createdAt,
  };
}

async function sha256(content: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(content),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildAuditArchive(
  data: AuditArchiveData,
  options: AuditArchiveOptions,
): Promise<AuditArchiveResult> {
  const eventRows = data.businessEvents.map(eventToArchiveRow);
  const eventJson = JSON.stringify(
    data.businessEvents.map((event) => ({
      id: event.id,
      workspace_id: event.workspaceId,
      entity_type: event.entityType,
      entity_id: event.entityId,
      event_type: event.eventType,
      actor_id: event.actorId,
      reason: event.reason,
      changes: event.changes,
      correlation_id: event.correlationId,
      created_at: event.createdAt,
    })),
    null,
    2,
  );
  const files = new Map<string, { content: string; rows: number }>([
    [
      'business-events.csv',
      { content: rowsToCsv(eventRows, BUSINESS_EVENT_HEADERS), rows: eventRows.length },
    ],
    ['business-events.json', { content: eventJson, rows: eventRows.length }],
    [
      'item-costs.csv',
      {
        content: rowsToCsv(data.itemCosts, ARCHIVE_HEADERS.itemCosts),
        rows: data.itemCosts.length,
      },
    ],
    [
      'sale-line-lot-allocations.csv',
      {
        content: rowsToCsv(data.saleLineLotAllocations, ARCHIVE_HEADERS.saleLineLotAllocations),
        rows: data.saleLineLotAllocations.length,
      },
    ],
    [
      'purchases.csv',
      {
        content: rowsToCsv(data.purchases, ARCHIVE_HEADERS.purchases),
        rows: data.purchases.length,
      },
    ],
    [
      'purchase-lines.csv',
      {
        content: rowsToCsv(data.purchaseLines, ARCHIVE_HEADERS.purchaseLines),
        rows: data.purchaseLines.length,
      },
    ],
    [
      'purchase-costs.csv',
      {
        content: rowsToCsv(data.purchaseCosts, ARCHIVE_HEADERS.purchaseCosts),
        rows: data.purchaseCosts.length,
      },
    ],
    [
      'inventory-items.csv',
      {
        content: rowsToCsv(data.inventoryItems, ARCHIVE_HEADERS.inventoryItems),
        rows: data.inventoryItems.length,
      },
    ],
    [
      'stock-lots.csv',
      {
        content: rowsToCsv(data.stockLots, ARCHIVE_HEADERS.stockLots),
        rows: data.stockLots.length,
      },
    ],
    [
      'stock-movements.csv',
      {
        content: rowsToCsv(data.stockMovements, ARCHIVE_HEADERS.stockMovements),
        rows: data.stockMovements.length,
      },
    ],
    [
      'sales.csv',
      { content: rowsToCsv(data.sales, ARCHIVE_HEADERS.sales), rows: data.sales.length },
    ],
    [
      'sale-lines.csv',
      {
        content: rowsToCsv(data.saleLines, ARCHIVE_HEADERS.saleLines),
        rows: data.saleLines.length,
      },
    ],
    [
      'sale-costs.csv',
      {
        content: rowsToCsv(data.saleCosts, ARCHIVE_HEADERS.saleCosts),
        rows: data.saleCosts.length,
      },
    ],
  ]);
  const manifestFiles = await Promise.all(
    Array.from(files, async ([name, file]) => ({
      name,
      rows: file.rows,
      sha256: await sha256(file.content),
    })),
  );
  const manifest: AuditExportManifest = {
    schemaVersion: '1.1.0',
    exportVersion: '1.1.0',
    createdAt: options.createdAt,
    workspaceId: options.workspaceId,
    filters: options.filters,
    files: manifestFiles,
  };
  const zip = new JSZip();
  for (const [name, file] of files) zip.file(name, file.content);
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const filename = `flipbase-audit-${options.createdAt.replace(/\.\d{3}Z$/u, 'Z').replaceAll(':', '-')}.zip`;
  return { filename, bytes, manifest };
}

@Injectable({ providedIn: 'root' })
export class AuditExportService {
  private readonly supabase = inject(SupabaseService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly workspaceService = inject(WorkspaceService);

  async createArchive(request: AuditArchiveRequest): Promise<AuditArchiveResult> {
    if (this.mockStore.isDemoMode()) {
      throw new Error(
        'Das vollständige Prüfarchiv steht im lokalen Demo-Modus nicht zur Verfügung.',
      );
    }
    if (this.workspaceService.currentWorkspace()?.id !== request.workspaceId) {
      throw new Error('Ein Datenarchiv kann nur für den aktiven Workspace erstellt werden.');
    }
    this.assertCurrentRequest(request);
    const query = this.supabase.client.rpc('export_audit_snapshot', {
      p_workspace_id: request.workspaceId,
      p_filter: this.manifestFilters(request),
    });
    const { data, error } = await (request.signal ? query.abortSignal(request.signal) : query);
    this.assertCurrentRequest(request);
    if (error) throw new Error(`Das Prüfarchiv konnte nicht geladen werden: ${error.message}`);
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Die Snapshot-Antwort ist unvollständig.');
    const snapshot = data as Record<string, unknown>;
    if (typeof snapshot['captured_at'] !== 'string' || typeof snapshot['snapshot'] !== 'string')
      throw new Error('Der Snapshot-Nachweis fehlt.');
    request.onProgress?.(60);
    const tables = Object.values(ARCHIVE_TABLES);
    const collected = new Map<ArchiveTableName, readonly ArchiveRow[]>();
    for (const table of tables) {
      collected.set(table, this.snapshotRows(snapshot, table));
    }
    const events = this.snapshotRows(snapshot, 'business_events').map((value) => {
      const event = value as Database['public']['Tables']['business_events']['Row'];
      return {
        id: event.id,
        workspaceId: event.workspace_id,
        entityType: event.entity_type as BusinessEvent['entityType'],
        entityId: event.entity_id,
        eventType: event.event_type,
        eventLabel: mapBusinessEventLabel(event.event_type),
        actorId: event.actor_id,
        reason: event.reason,
        changes: event.changes,
        correlationId: event.correlation_id,
        createdAt: event.created_at,
      };
    });
    this.assertCurrentRequest(request);
    const createdAt = snapshot['captured_at'];
    const archive = await buildAuditArchive(
      {
        businessEvents: events,
        purchases: collected.get('purchases') ?? [],
        purchaseLines: collected.get('purchase_lines') ?? [],
        purchaseCosts: collected.get('purchase_costs') ?? [],
        inventoryItems: collected.get('inventory_items') ?? [],
        itemCosts: collected.get('item_costs') ?? [],
        stockLots: collected.get('stock_lots') ?? [],
        stockMovements: collected.get('stock_movements') ?? [],
        sales: collected.get('sales') ?? [],
        saleLines: collected.get('sale_lines') ?? [],
        saleCosts: collected.get('sale_cost_entries') ?? [],
        saleLineLotAllocations: collected.get('sale_line_lot_allocations') ?? [],
      },
      {
        workspaceId: request.workspaceId,
        createdAt,
        filters: { ...this.manifestFilters(request), snapshot: snapshot['snapshot'] },
      },
    );
    this.assertCurrentRequest(request);
    request.onProgress?.(100);
    return archive;
  }

  downloadArchive(result: AuditArchiveResult): void {
    const blob = new Blob([result.bytes as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private snapshotRows(snapshot: Record<string, unknown>, table: string): readonly ArchiveRow[] {
    const rows = snapshot[table];
    if (
      !Array.isArray(rows) ||
      rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))
    ) {
      throw new Error(`Die Snapshot-Daten aus ${table} sind unvollständig.`);
    }
    return rows as ArchiveRow[];
  }

  private assertCurrentRequest(request: AuditArchiveRequest): void {
    this.throwIfAborted(request.signal);
    if (this.workspaceService.currentWorkspace()?.id !== request.workspaceId)
      throw new DOMException(
        'Der Workspace wurde gewechselt. Der Export wurde abgebrochen.',
        'AbortError',
      );
  }

  private manifestFilters(
    request: AuditArchiveRequest,
  ): Readonly<Record<string, string | number | null>> {
    return {
      entity_type: request.entityType ?? null,
      entity_id: request.entityId ?? null,
      event_type: request.eventType ?? null,
      actor_id: request.actorId ?? null,
      from: request.from ?? null,
      to: request.to ?? null,
    };
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new DOMException('Der Export wurde abgebrochen.', 'AbortError');
  }
}
