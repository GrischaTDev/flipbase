import { Injectable, inject } from '@angular/core';
import JSZip from 'jszip';
import {
  AuditExportManifest,
  BusinessEvent,
  BusinessEventFilter,
} from '../models/business-event.models';
import { Database } from '../models/supabase.types';
import { BusinessEventService } from './business-event.service';
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
  | 'sale_cost_entries';

export interface AuditArchiveData {
  readonly businessEvents: readonly BusinessEvent[];
  readonly purchases: readonly ArchiveRow[];
  readonly purchaseLines: readonly ArchiveRow[];
  readonly purchaseCosts: readonly ArchiveRow[];
  readonly inventoryItems: readonly ArchiveRow[];
  readonly stockLots: readonly ArchiveRow[];
  readonly stockMovements: readonly ArchiveRow[];
  readonly sales: readonly ArchiveRow[];
  readonly saleLines: readonly ArchiveRow[];
  readonly saleCosts: readonly ArchiveRow[];
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

const ARCHIVE_HEADERS = {
  purchases: [
    'id',
    'workspace_id',
    'type',
    'title',
    'source_id',
    'supplier_id',
    'purchase_date',
    'purchase_price',
    'shipping_cost',
    'other_costs',
    'cost_allocation_mode',
    'entry_status',
    'finalized_at',
    'finalized_by',
    'created_at',
    'updated_at',
  ],
  purchaseLines: [
    'id',
    'workspace_id',
    'purchase_id',
    'catalog_product_id',
    'title_snapshot',
    'line_kind',
    'ordered_quantity',
    'received_quantity',
    'unit_purchase_price',
    'line_total',
    'price_mode',
    'condition_snapshot',
    'estimated_market_value',
    'created_at',
    'updated_at',
  ],
  purchaseCosts: [
    'id',
    'workspace_id',
    'purchase_id',
    'type',
    'amount',
    'description',
    'allocation_method',
    'target_purchase_line_id',
    'created_at',
  ],
  inventoryItems: [
    'id',
    'workspace_id',
    'purchase_id',
    'purchase_line_id',
    'title',
    'condition',
    'status',
    'allocated_purchase_cost',
    'expected_value',
    'sku',
    'ean',
    'created_at',
    'updated_at',
  ],
  stockLots: [
    'id',
    'workspace_id',
    'purchase_id',
    'purchase_line_id',
    'catalog_product_id',
    'received_quantity',
    'remaining_quantity',
    'unit_cost',
    'received_at',
    'created_at',
  ],
  stockMovements: [
    'id',
    'workspace_id',
    'stock_lot_id',
    'sale_line_id',
    'direction',
    'quantity',
    'reason',
    'created_at',
  ],
  sales: [
    'id',
    'workspace_id',
    'inventory_item_id',
    'platform',
    'sale_price',
    'sale_price_total',
    'shipping_revenue',
    'sale_date',
    'platform_fee',
    'shipping_cost',
    'packaging_cost',
    'other_costs',
    'returned_at',
    'refund_amount',
    'voided_at',
    'voided_by',
    'void_reason',
    'created_at',
  ],
  saleLines: [
    'id',
    'workspace_id',
    'sale_id',
    'catalog_product_id',
    'inventory_item_id',
    'title_snapshot',
    'quantity',
    'unit_sale_price',
    'line_total',
    'cost_of_goods_sold',
    'tax_mode',
    'created_at',
  ],
  saleCosts: ['id', 'workspace_id', 'sale_id', 'category', 'description', 'amount', 'created_at'],
} as const;

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
    schemaVersion: '1.0.0',
    exportVersion: '1.0.0',
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
  private readonly businessEvents = inject(BusinessEventService);

  async createArchive(request: AuditArchiveRequest): Promise<AuditArchiveResult> {
    if (this.mockStore.isDemoMode()) {
      throw new Error(
        'Das vollständige Prüfarchiv steht im lokalen Demo-Modus nicht zur Verfügung.',
      );
    }
    if (this.workspaceService.currentWorkspace()?.id !== request.workspaceId) {
      throw new Error('Ein Datenarchiv kann nur für den aktiven Workspace erstellt werden.');
    }
    const events = await this.collectEvents(request);
    request.onProgress?.(15);
    const tables: readonly ArchiveTableName[] = [
      'purchases',
      'purchase_lines',
      'purchase_costs',
      'inventory_items',
      'stock_lots',
      'stock_movements',
      'sales',
      'sale_lines',
      'sale_cost_entries',
    ];
    const collected = new Map<ArchiveTableName, readonly ArchiveRow[]>();
    for (const [index, table] of tables.entries()) {
      this.throwIfAborted(request.signal);
      collected.set(table, await this.collectTable(table, request.workspaceId, request.signal));
      request.onProgress?.(15 + Math.round(((index + 1) / tables.length) * 65));
    }
    this.throwIfAborted(request.signal);
    const createdAt = new Date().toISOString();
    const archive = await buildAuditArchive(
      {
        businessEvents: events,
        purchases: collected.get('purchases') ?? [],
        purchaseLines: collected.get('purchase_lines') ?? [],
        purchaseCosts: collected.get('purchase_costs') ?? [],
        inventoryItems: collected.get('inventory_items') ?? [],
        stockLots: collected.get('stock_lots') ?? [],
        stockMovements: collected.get('stock_movements') ?? [],
        sales: collected.get('sales') ?? [],
        saleLines: collected.get('sale_lines') ?? [],
        saleCosts: collected.get('sale_cost_entries') ?? [],
      },
      {
        workspaceId: request.workspaceId,
        createdAt,
        filters: this.manifestFilters(request),
      },
    );
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

  private async collectEvents(request: AuditArchiveRequest): Promise<readonly BusinessEvent[]> {
    const events: BusinessEvent[] = [];
    let cursor: string | undefined;
    do {
      this.throwIfAborted(request.signal);
      const page = await this.businessEvents.listEvents({ ...request, cursor, pageSize: 100 });
      events.push(...page.events);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return events;
  }

  private async collectTable(
    table: ArchiveTableName,
    workspaceId: string,
    signal?: AbortSignal,
  ): Promise<readonly ArchiveRow[]> {
    const rows: ArchiveRow[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      this.throwIfAborted(signal);
      const { data, error } = await this.supabase.client
        .from(table as keyof Database['public']['Tables'])
        .select('*')
        .filter('workspace_id', 'eq', workspaceId)
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(`Die Archivdaten aus ${table} konnten nicht geladen werden.`);
      const page = (data ?? []) as unknown as ArchiveRow[];
      rows.push(...page);
      if (page.length < pageSize) return rows;
    }
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
