import { Injectable, inject } from '@angular/core';
import JSZip from 'jszip';
import {
  AuditExportManifest,
  BusinessEvent,
  BusinessEventFilter,
} from '../models/business-event.models';
import { Database } from '../models/supabase.types';
import { mapBusinessEventLabel } from './business-event.service';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';

type ArchiveRow = Readonly<Record<string, unknown>>;
type ArchiveTableName =
  | 'suppliers'
  | 'catalog_products'
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
  | 'sale_line_lot_allocations'
  | 'returns'
  | 'inventory_reconciliation_events'
  | 'invoices'
  | 'invoice_items'
  | 'purchase_documents'
  | 'expense_categories'
  | 'expense_recurring_rules'
  | 'expenses'
  | 'expense_documents';

type ArchiveDocumentBucket = 'purchase-documents' | 'expense-documents';

interface AuditArchiveDocumentRequest {
  readonly bucket: ArchiveDocumentBucket;
  readonly documentId: string;
  readonly originalFileName: string;
  readonly storagePath: string;
  readonly archivePath: string;
}

export interface AuditArchiveDocument extends AuditArchiveDocumentRequest {
  readonly content: Uint8Array | null;
  readonly failure: string | null;
}

export interface AuditArchiveDocumentFailure extends AuditArchiveDocumentRequest {
  readonly message: string;
}

export interface AuditArchiveData {
  readonly businessEvents: readonly BusinessEvent[];
  readonly suppliers: readonly ArchiveRow[];
  readonly catalogProducts: readonly ArchiveRow[];
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
  readonly returns: readonly ArchiveRow[];
  readonly inventoryReconciliationEvents: readonly ArchiveRow[];
  readonly invoices: readonly ArchiveRow[];
  readonly invoiceItems: readonly ArchiveRow[];
  readonly purchaseDocuments: readonly ArchiveRow[];
  readonly expenseCategories: readonly ArchiveRow[];
  readonly expenseRecurringRules: readonly ArchiveRow[];
  readonly expenses: readonly ArchiveRow[];
  readonly expenseDocuments: readonly ArchiveRow[];
  readonly documents: readonly AuditArchiveDocument[];
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
  readonly documentFailures: readonly AuditArchiveDocumentFailure[];
}

export interface AuditArchiveRequest extends Omit<BusinessEventFilter, 'cursor'> {
  readonly signal?: AbortSignal;
  readonly onProgress?: (percent: number) => void;
}

const ARCHIVE_TABLES = {
  suppliers: 'suppliers',
  catalogProducts: 'catalog_products',
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
  returns: 'returns',
  inventoryReconciliationEvents: 'inventory_reconciliation_events',
  invoices: 'invoices',
  invoiceItems: 'invoice_items',
  purchaseDocuments: 'purchase_documents',
  expenseCategories: 'expense_categories',
  expenseRecurringRules: 'expense_recurring_rules',
  expenses: 'expenses',
  expenseDocuments: 'expense_documents',
} as const;

const ARCHIVE_HEADERS = {
  suppliers: [
    'id',
    'workspace_id',
    'seller_type',
    'name',
    'contact_person',
    'country_code',
    'country',
    'street',
    'address_extra',
    'postal_code',
    'city',
    'email',
    'phone',
    'website',
    'notes',
    'is_active',
    'created_at',
  ],
  catalogProducts: [
    'id',
    'workspace_id',
    'title',
    'brand',
    'model',
    'ean',
    'category',
    'tracking_mode',
    'is_public_store',
    'listing_price',
    'created_at',
    'updated_at',
  ],
  purchases: [
    'id',
    'cost_allocation_mode',
    'created_at',
    'entry_status',
    'estimated_delivery',
    'finalized_at',
    'finalized_by',
    'notes',
    'purchase_date',
    'purchase_price',
    'receiving_status',
    'arrived_at',
    'supplier_id',
    'supplier_reference',
    'title',
    'total_purchase_cost',
    'tracking_carrier',
    'tracking_number',
    'tracking_status',
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
    'tax_treatment',
    'type',
    'workspace_id',
  ],
  inventoryItems: [
    'id',
    'allocated_purchase_cost',
    'tax_purchase_cost',
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
    'remaining_tax_unit_costs',
    'remaining_unit_costs',
    'unit_tax_purchase_cost',
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
    'tax_purchase_cost',
    'tax_cost_allocations',
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
    'consumption_sequence',
    'created_at',
    'tax_purchase_cost',
    'tax_cost_allocations',
    'active_tax_unit_costs',
    'active_unit_costs',
  ],
  returns: [
    'id',
    'workspace_id',
    'sale_id',
    'inventory_item_id',
    'credit_note_number',
    'return_date',
    'reason',
    'refund_amount',
    'is_full_refund',
    'restock_action',
    'buyer_name',
    'notes',
    'created_at',
  ],
  inventoryReconciliationEvents: [
    'id',
    'workspace_id',
    'inventory_item_id',
    'actor_id',
    'event_type',
    'previous_status',
    'new_status',
    'reason',
    'created_at',
  ],
  invoices: [
    'id',
    'workspace_id',
    'sale_id',
    'store_order_id',
    'invoice_number',
    'order_number',
    'invoice_date',
    'delivery_date',
    'seller',
    'buyer',
    'subtotal',
    'shipping_cost',
    'total',
    'tax_mode',
    'tax_clause',
    'payment_method',
    'payment_status',
    'payment_due_date',
    'notes',
    'created_at',
  ],
  invoiceItems: [
    'id',
    'invoice_id',
    'sku',
    'title',
    'condition',
    'quantity',
    'unit_price',
    'total_price',
  ],
  purchaseDocuments: [
    'id',
    'workspace_id',
    'purchase_id',
    'document_type',
    'original_file_name',
    'storage_path',
    'mime_type',
    'file_size',
    'created_at',
    'created_by',
  ],
  expenseCategories: [
    'id',
    'workspace_id',
    'name',
    'sort_order',
    'is_default',
    'is_archived',
    'created_at',
    'created_by',
    'updated_at',
  ],
  expenseRecurringRules: [
    'id',
    'workspace_id',
    'category_id',
    'title',
    'vendor_name',
    'quantity',
    'gross_amount',
    'vat_rate',
    'frequency',
    'start_date',
    'end_date',
    'is_active',
    'notes',
    'created_at',
    'created_by',
    'updated_at',
  ],
  expenses: [
    'id',
    'workspace_id',
    'category_id',
    'recurring_rule_id',
    'occurrence_date',
    'title',
    'vendor_name',
    'quantity',
    'gross_amount',
    'vat_rate',
    'expense_date',
    'due_date',
    'status',
    'payment_date',
    'notes',
    'deleted_at',
    'created_at',
    'created_by',
    'updated_at',
  ],
  expenseDocuments: [
    'id',
    'workspace_id',
    'expense_id',
    'document_type',
    'original_file_name',
    'storage_path',
    'mime_type',
    'file_size',
    'created_at',
    'created_by',
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

type ArchiveFileContent = string | Uint8Array;

async function sha256(content: ArchiveFileContent): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const source = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
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
  const files = new Map<string, { content: ArchiveFileContent; rows: number }>([
    [
      'business-events.csv',
      { content: rowsToCsv(eventRows, BUSINESS_EVENT_HEADERS), rows: eventRows.length },
    ],
    ['business-events.json', { content: eventJson, rows: eventRows.length }],
    [
      'suppliers.csv',
      {
        content: rowsToCsv(data.suppliers, ARCHIVE_HEADERS.suppliers),
        rows: data.suppliers.length,
      },
    ],
    [
      'catalog-products.csv',
      {
        content: rowsToCsv(data.catalogProducts, ARCHIVE_HEADERS.catalogProducts),
        rows: data.catalogProducts.length,
      },
    ],
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
    [
      'returns.csv',
      { content: rowsToCsv(data.returns, ARCHIVE_HEADERS.returns), rows: data.returns.length },
    ],
    [
      'inventory-reconciliation-events.csv',
      {
        content: rowsToCsv(
          data.inventoryReconciliationEvents,
          ARCHIVE_HEADERS.inventoryReconciliationEvents,
        ),
        rows: data.inventoryReconciliationEvents.length,
      },
    ],
    [
      'invoices.csv',
      { content: rowsToCsv(data.invoices, ARCHIVE_HEADERS.invoices), rows: data.invoices.length },
    ],
    [
      'invoice-items.csv',
      {
        content: rowsToCsv(data.invoiceItems, ARCHIVE_HEADERS.invoiceItems),
        rows: data.invoiceItems.length,
      },
    ],
    [
      'purchase-documents.csv',
      {
        content: rowsToCsv(data.purchaseDocuments, ARCHIVE_HEADERS.purchaseDocuments),
        rows: data.purchaseDocuments.length,
      },
    ],
    [
      'expense-categories.csv',
      {
        content: rowsToCsv(data.expenseCategories, ARCHIVE_HEADERS.expenseCategories),
        rows: data.expenseCategories.length,
      },
    ],
    [
      'expense-recurring-rules.csv',
      {
        content: rowsToCsv(data.expenseRecurringRules, ARCHIVE_HEADERS.expenseRecurringRules),
        rows: data.expenseRecurringRules.length,
      },
    ],
    [
      'expenses.csv',
      { content: rowsToCsv(data.expenses, ARCHIVE_HEADERS.expenses), rows: data.expenses.length },
    ],
    [
      'expense-documents.csv',
      {
        content: rowsToCsv(data.expenseDocuments, ARCHIVE_HEADERS.expenseDocuments),
        rows: data.expenseDocuments.length,
      },
    ],
  ]);
  const documentFailures: AuditArchiveDocumentFailure[] = [];
  const documentReport = data.documents.map((document) => {
    if (document.content) {
      files.set(document.archivePath, { content: document.content, rows: 0 });
      return {
        bucket: document.bucket,
        document_id: document.documentId,
        original_file_name: document.originalFileName,
        storage_path: document.storagePath,
        archive_path: document.archivePath,
        status: 'included',
      };
    }
    const message = document.failure ?? 'Die Originaldatei war nicht verfügbar.';
    documentFailures.push({
      bucket: document.bucket,
      documentId: document.documentId,
      originalFileName: document.originalFileName,
      storagePath: document.storagePath,
      archivePath: document.archivePath,
      message,
    });
    return {
      bucket: document.bucket,
      document_id: document.documentId,
      original_file_name: document.originalFileName,
      storage_path: document.storagePath,
      archive_path: document.archivePath,
      status: 'unavailable',
      message,
    };
  });
  files.set('document-downloads.json', {
    content: JSON.stringify(documentReport, null, 2),
    rows: documentReport.length,
  });
  const manifestFiles = await Promise.all(
    Array.from(files, async ([name, file]) => ({
      name,
      rows: file.rows,
      sha256: await sha256(file.content),
    })),
  );
  const manifest: AuditExportManifest = {
    schemaVersion: '1.3.0',
    exportVersion: '1.3.0',
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
  return { filename, bytes, manifest, documentFailures };
}

@Injectable({ providedIn: 'root' })
export class AuditExportService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);

  async createArchive(request: AuditArchiveRequest): Promise<AuditArchiveResult> {
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
    request.onProgress?.(50);
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
    const documents = await this.downloadDocuments(
      [
        ...this.snapshotDocumentRequests(
          collected.get('purchase_documents') ?? [],
          'purchase-documents',
        ),
        ...this.snapshotDocumentRequests(
          collected.get('expense_documents') ?? [],
          'expense-documents',
        ),
      ],
      request,
    );
    this.assertCurrentRequest(request);
    const createdAt = snapshot['captured_at'];
    const archive = await buildAuditArchive(
      {
        businessEvents: events,
        suppliers: collected.get('suppliers') ?? [],
        catalogProducts: collected.get('catalog_products') ?? [],
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
        returns: collected.get('returns') ?? [],
        inventoryReconciliationEvents: collected.get('inventory_reconciliation_events') ?? [],
        invoices: collected.get('invoices') ?? [],
        invoiceItems: collected.get('invoice_items') ?? [],
        purchaseDocuments: collected.get('purchase_documents') ?? [],
        expenseCategories: collected.get('expense_categories') ?? [],
        expenseRecurringRules: collected.get('expense_recurring_rules') ?? [],
        expenses: collected.get('expenses') ?? [],
        expenseDocuments: collected.get('expense_documents') ?? [],
        documents,
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

  private snapshotDocumentRequests(
    rows: readonly ArchiveRow[],
    bucket: ArchiveDocumentBucket,
  ): readonly AuditArchiveDocumentRequest[] {
    return rows.map((row) => {
      const documentId = row['id'];
      const originalFileName = row['original_file_name'];
      const storagePath = row['storage_path'];
      if (
        typeof documentId !== 'string' ||
        typeof originalFileName !== 'string' ||
        typeof storagePath !== 'string' ||
        !storagePath.startsWith(`${bucket}/`) ||
        storagePath.includes('..')
      ) {
        throw new Error(`Die Belegmetadaten aus ${bucket} sind unvollständig.`);
      }
      return {
        bucket,
        documentId,
        originalFileName,
        storagePath,
        archivePath: `documents/${storagePath}`,
      };
    });
  }

  private async downloadDocuments(
    documents: readonly AuditArchiveDocumentRequest[],
    request: AuditArchiveRequest,
  ): Promise<readonly AuditArchiveDocument[]> {
    const downloaded: AuditArchiveDocument[] = [];
    for (const [index, document] of documents.entries()) {
      this.assertCurrentRequest(request);
      const { data, error } = await this.supabase.client.storage
        .from(document.bucket)
        .download(document.storagePath);
      this.assertCurrentRequest(request);
      let content: Uint8Array | null = null;
      let failure: string | null = null;
      if (error) {
        failure = error.message || 'Die Originaldatei konnte nicht geladen werden.';
      } else if (!data) {
        failure = 'Die Originaldatei wurde nicht gefunden.';
      } else {
        content = new Uint8Array(await data.arrayBuffer());
        this.assertCurrentRequest(request);
      }
      downloaded.push({ ...document, content, failure });
      request.onProgress?.(50 + Math.round(((index + 1) / documents.length) * 35));
    }
    if (documents.length === 0) request.onProgress?.(85);
    return downloaded;
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
