export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at?: string;
  updated_at?: string;
}

export type TaxMode = 'diff_25a' | 'kleinunternehmer_19' | 'regular_19';

export interface Workspace {
  id: string;
  name: string;
  currency?: string;
  tax_mode?: TaxMode;
  min_roi_percent: number;
  min_profit_amount: number;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
}

export interface WorkspaceSummary {
  workspace: Workspace;
  inventoryCount: number;
  inventoryValue: number;
  purchasesCount: number;
  totalInvested: number;
  salesCount: number;
  totalRevenue: number;
  totalProfit: number;
  roi: number;
  role: WorkspaceRole;
}

export interface ConsolidatedHoldingSummary {
  workspacesCount: number;
  totalInventoryCount: number;
  totalInventoryValue: number;
  totalCapitalInvested: number;
  totalRevenue: number;
  totalNetProfit: number;
  averageRoi: number;
  workspaceSummaries: WorkspaceSummary[];
}

export type WorkspaceRole =
  'owner' | 'admin' | 'member' | 'fulfillment' | 'accountant' | 'readonly';

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  email: string;
  full_name?: string | null;
  role: WorkspaceRole;
  created_at?: string;
  joined_at?: string;
}

export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  invited_by_name?: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

export interface Source {
  id: string;
  workspace_id: string;
  name: string;
  type?: string;
  is_default?: boolean;
  is_active?: boolean;
  created_at?: string;
}

export interface Supplier {
  seller_type?: 'private' | 'business' | null;
  contact_person?: string | null;
  country?: string | null;
  street?: string | null;
  address_extra?: string | null;
  postal_code?: string | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
  profile_url?: string | null;
  website?: string | null;
  id: string;
  workspace_id: string;
  name: string;
  contact_info?: string | null;
  notes?: string | null;
  created_at?: string;
  /**
   * Falsch bedeutet archiviert: nicht mehr auswählbar, in vorhandenen
   * Einkäufen aber weiterhin sichtbar. Einkäufe verweisen auf Lieferanten,
   * und diese Verweise müssen nachvollziehbar bleiben.
   */
  is_active?: boolean;
}

export type PurchaseType = 'single' | 'mystery_pack' | 'lot' | 'pallet';

/**
 * Bezeichnung der Einkaufsart im Klartext.
 *
 * Bewusst als vollstaendiger Record und nicht als Abfrage im Einzelfall: So
 * verlangt TypeScript fuer jede neue Art eine Bezeichnung. Vorher stand in der
 * Benachrichtigung `type === 'pallet' ? 'Palette' : 'Einzelkauf'` - eine
 * Mystery Box wurde damit als Einzelkauf gemeldet.
 */
export const EINKAUFSART_BEZEICHNUNG: Record<PurchaseType, string> = {
  single: 'Einzelkauf',
  mystery_pack: 'Mystery Box',
  lot: 'Konvolut',
  pallet: 'Palette',
};
export type CostAllocationMode = 'manual' | 'even' | 'value_weighted';
export type PurchaseReceivingStatus =
  'draft' | 'ordered' | 'partially_received' | 'received' | 'archived';

export type TrackingMode = 'quantity' | 'individual';
export type StockMovementReason =
  | 'receipt'
  | 'sale'
  | 'return'
  | 'correction'
  | 'damage'
  | 'loss'
  | 'reservation'
  | 'reservation_release';

import type {
  PurchaseCostAllocationMethod,
  PurchaseEntryStatus,
  PurchaseLinePriceMode,
} from './purchase-costing.models';

export interface PurchaseCost {
  id?: string;
  workspace_id?: string;
  purchase_id?: string;
  type: string;
  amount: number;
  description?: string | null;
  allocation_method?: PurchaseCostAllocationMethod;
  target_purchase_line_id?: string | null;
  created_at?: string;
}

export type TrackingCarrier =
  'dhl' | 'dpd' | 'hermes' | 'ups' | 'gls' | 'fedex' | 'deutsche_post' | 'other';
export type InboundTrackingStatus =
  'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception';

export interface InboundTrackingCheckpoint {
  timestamp: string;
  status: InboundTrackingStatus;
  location?: string;
  description: string;
}

export interface InboundTrackingInfo {
  carrier: TrackingCarrier;
  carrier_name: string;
  tracking_number: string;
  status: InboundTrackingStatus;
  status_label: string;
  tracking_url: string;
  estimated_delivery?: string | null;
  last_checkpoint?: string | null;
  checkpoints?: InboundTrackingCheckpoint[];
}

export interface Purchase {
  record_number?: string | null;
  numbering_series_id?: number | null;
  numbering_version?: number | null;
  numbered_at?: string | null;
  request_id?: string | null;
  content_status?: 'known' | 'unknown';
  pricing_mode?: 'individual' | 'total' | null;
  shipment_status?: 'not_shipped' | 'in_transit' | 'arrived';
  supplier_reference?: string | null;
  discount_amount?: number;
  id: string;
  workspace_id: string;
  type: PurchaseType;
  purchase_type?: PurchaseType;
  title: string;
  source_id?: string | null;
  supplier_id?: string | null;
  purchase_date: string;
  purchase_price: number | null;
  shipping_cost?: number;
  other_costs?: number;
  cost_allocation_mode: CostAllocationMode;
  original_url?: string | null;
  tracking_number?: string | null;
  tracking_carrier?: TrackingCarrier | null;
  tracking_status?: InboundTrackingStatus | null;
  receiving_status?: PurchaseReceivingStatus;
  entry_status?: PurchaseEntryStatus;
  finalized_at?: string | null;
  finalized_by?: string | null;
  estimated_delivery?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  source?: Source;
  supplier?: Supplier;
  costs?: PurchaseCost[];
  items_count?: number;
  total_purchase_cost?: number | null;
  items?: InventoryItem[];
  purchase_lines?: PurchaseLine[];
}

export type ItemCondition =
  'new' | 'like_new' | 'very_good' | 'used' | 'heavily_used' | 'defective';
export type ItemStatus =
  | 'received'
  | 'needs_review'
  | 'researched'
  | 'ready'
  | 'listed'
  | 'reserved'
  | 'sold'
  | 'returned'
  | 'archived'
  | 'defective';

export type InventoryItemSaleState =
  | 'no_active_sale'
  | 'sold'
  | 'legacy_sold_unverified'
  | 'legacy_sale_header_without_line'
  | 'sale_status_conflict'
  | 'multiple_active_sales';

export interface ItemCost {
  id?: string;
  inventory_item_id?: string;
  type: string;
  amount: number;
  description?: string | null;
  created_at?: string;
}

export interface ItemMedia {
  id: string;
  inventory_item_id: string;
  storage_path: string;
  is_primary: boolean;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  sort_order?: number;
  created_at?: string;
}

export interface InventoryItem {
  id: string;
  workspace_id: string;
  purchase_id?: string | null;
  purchase_line_id?: string | null;
  category?: string | null;
  title: string;
  brand?: string | null;
  model?: string | null;
  condition: ItemCondition;
  condition_notes?: string | null;
  status: ItemStatus;
  sku?: string | null;
  ean?: string | null;
  description?: string | null;
  allocated_purchase_cost: number;
  expected_value?: number | null;
  tax_mode_override?: TaxMode | null;
  is_public_store?: boolean;
  notes?: string | null;
  weight_g?: number | null;
  dimension_length_cm?: number | null;
  dimension_width_cm?: number | null;
  dimension_height_cm?: number | null;
  created_at?: string;
  updated_at?: string;
  sale_state?: InventoryItemSaleState;
  active_sale_count?: number;
  active_sale_id?: string | null;
  readonly archived_at?: string | null;
  readonly archived_by?: string | null;
  purchase?: Purchase;
  costs?: ItemCost[];
  media?: ItemMedia[];
  sale?: Sale;
  total_item_cost?: number;
  profit_potential?: number;
}

export interface ResearchComparable {
  id?: string;
  research_id?: string;
  platform: 'ebay' | 'kleinanzeigen' | 'vinted' | string;
  external_id?: string;
  title: string;
  price: number;
  condition?: string;
  is_sold: boolean;
  sold_at?: string | null;
  listed_at?: string | null;
  url?: string;
  similarity_score: number;
}

export interface MarketResearch {
  id: string;
  workspace_id: string;
  inventory_item_id?: string | null;
  query: string;
  fair_value: number | null;
  fast_sale_price: number | null;
  recommended_listing_price: number | null;
  confidence_score: number | null;
  deal_score: number | null;
  max_buy_price: number | null;
  created_at: string;
  comparables?: ResearchComparable[];
}

export interface ResearchQuery {
  id: string;
  workspace_id: string;
  query_text?: string;
  search_term?: string;
  source?: string;
  result_count?: number;
  min_price: number;
  max_price: number;
  avg_price?: number;
  median_price: number;
  sample_size?: number;
  created_at?: string;
  results?: ResearchResult[];
}

export interface ResearchResult {
  id: string;
  research_query_id: string;
  title: string;
  price: number;
  source: string;
  url?: string | null;
  created_at?: string;
}

export interface ListingDraft {
  id: string;
  inventory_item_id: string;
  platform: 'ebay' | 'kleinanzeigen' | 'vinted' | 'store' | string;
  title: string;
  description: string;
  price: number;
  status: 'draft' | 'published';
  created_at?: string;
  updated_at?: string;
}

export type ShippingMode = 'seller_arranged' | 'platform_prepaid' | 'pickup';

export type SaleCostCategory = 'packaging' | 'payment_fee' | 'promotion' | 'other';

export interface SaleCostEntry {
  id: string;
  workspace_id: string;
  sale_id: string;
  category: SaleCostCategory;
  description?: string | null;
  amount: number;
  created_at?: string;
}

export interface Sale {
  record_number?: string | null;
  numbering_series_id?: number | null;
  numbering_version?: number | null;
  numbered_at?: string | null;
  cost_basis_status?: 'known' | 'unknown';
  id: string;
  workspace_id: string;
  inventory_item_id?: string | null;
  platform: 'ebay' | 'kleinanzeigen' | 'vinted' | 'direct' | 'custom_store' | string;
  sale_price: number;
  sale_price_total?: number | null;
  sale_date: string;
  platform_fee: number;
  shipping_cost: number;
  packaging_cost: number;
  other_costs: number;
  shipping_revenue?: number;
  shipping_mode?: ShippingMode | null;
  external_order_id?: string | null;
  external_listing_id?: string | null;
  buyer_notes?: string | null;
  /**
   * Zeitpunkt der Retoure. Ist er gesetzt, zaehlt der Verkauf nicht mehr als
   * realisierter Umsatz - der Artikel ist ja wieder da.
   */
  returned_at?: string | null;
  /** Tatsaechlich erstatteter Betrag, kann unter dem Verkaufspreis liegen. */
  refund_amount?: number | null;
  created_at?: string;
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  inventory_item?: InventoryItem;
  /** Ergebnis nach Wareneinsatz und direkt zurechenbaren Verkaufskosten. */
  net_profit?: number | null;
  /** Direkt zurechenbare Gebühren, Versand- und Zusatzkosten des Verkaufs. */
  selling_costs?: number;
  /** Ergebnis im Verhältnis zum Verkaufserlös. */
  margin_percent?: number | null;
  roi?: number | null;
  holding_duration_days?: number;
  /** Persistierte Verkaufspositionen; Altverkäufe werden als eine Position abgebildet. */
  lines?: SaleLine[];
  /** Kennzeichnet echte Datenbankpositionen gegenüber einem Anzeige-Fallback für Altverkäufe. */
  has_persisted_lines?: boolean;
  /** FIFO-Losentnahmen der Positionsmenge. */
  lot_allocations?: SaleLineLotAllocation[];
  /** Bestandsbewegungen, die durch diesen Verkauf entstanden sind. */
  stock_movements?: StockMovement[];
  /** Strukturierte Zusatzkosten, die innerhalb der Verkaufstransaktion persistiert wurden. */
  cost_entries?: SaleCostEntry[];
}

export interface CatalogProduct {
  id: string;
  workspace_id: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  ean?: string | null;
  category?: string | null;
  tracking_mode: TrackingMode;
  is_public_store: boolean;
  listing_price?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface PurchaseLine {
  id: string;
  workspace_id: string;
  purchase_id: string;
  catalog_product_id?: string | null;
  title_snapshot: string;
  ean_snapshot?: string | null;
  line_kind: TrackingMode;
  ordered_quantity: number;
  received_quantity: number;
  unit_purchase_price: number | null;
  line_total: number | null;
  allocated_additional_cost?: number;
  price_mode?: PurchaseLinePriceMode;
  condition_snapshot?: string | null;
  estimated_market_value?: number | null;
  allocated_total_cost?: number;
  created_at?: string;
  updated_at?: string;
}

export interface StockLot {
  purchase?: Purchase;
  id: string;
  workspace_id: string;
  purchase_id: string;
  purchase_line_id: string;
  catalog_product_id: string;
  received_quantity: number;
  remaining_quantity: number;
  unit_cost: number;
  received_at: string;
  created_at?: string;
}

export interface StockMovement {
  id: string;
  workspace_id: string;
  stock_lot_id: string;
  sale_line_id?: string | null;
  direction: 'in' | 'out';
  quantity: number;
  reason: StockMovementReason;
  created_at?: string;
}

export interface SaleLine {
  inventory_item?: InventoryItem;
  lot_allocations?: SaleLineLotAllocation[];
  id: string;
  sale_id: string;
  catalog_product_id?: string | null;
  inventory_item_id?: string | null;
  title_snapshot: string;
  quantity: number;
  unit_sale_price: number;
  line_total: number;
  cost_of_goods_sold: number;
  tax_mode: TaxMode;
}

export interface SaleLineLotAllocation {
  stock_lot?: StockLot;
  id: string;
  workspace_id: string;
  sale_line_id: string;
  stock_lot_id: string;
  quantity: number;
  unit_cost: number;
  allocated_cost?: number;
  active_allocated_cost?: number | null;
  created_at?: string;
}

export interface StockPosition {
  catalog_product_id: string;
  title: string;
  available_quantity: number;
  reserved_quantity: number;
  on_hand_quantity: number;
  oldest_available_unit_cost: number | null;
  is_public_store: boolean;
}

export interface ActivityLog {
  id: string;
  workspace_id: string;
  inventory_item_id?: string | null;
  action: string;
  notes?: string | null;
  created_at: string;
}

export interface DashboardMetrics {
  realized_profit: number;
  total_revenue: number;
  tied_capital: number;
  inventory_value: number;
  active_items_count: number;
  average_roi_percent: number;
}

/** Zeitraum, der im Verkaufsbericht einheitlich auf Kennzahlen, Diagramm und Tabelle wirkt. */
export type DashboardRange = 'today' | 'last_7_days' | 'month' | 'year';

export interface DashboardTimePoint {
  /** Maschinenlesbarer Beginn des Tages bzw. Monats im lokalen Kalender. */
  date: string;
  /** Kurze, im Diagramm sichtbare Beschriftung. */
  label: string;
  revenue: number;
  costOfGoodsSold: number | null;
  sellingCosts: number;
  resultAfterDirectCosts: number | null;
  /** Einkaufszahlungen bleiben vorübergehend für ältere Berichtsansichten verfügbar. */
  expenses: number;
  /** @deprecated Verwende resultAfterDirectCosts. */
  realizedProfit: number | null;
}

export interface DashboardSaleRow {
  saleId: string;
  date: string;
  articles: string;
  quantity: number;
  platform: string;
  revenue: number;
  costOfGoodsSold: number | null;
  sellingCosts: number;
  resultAfterDirectCosts: number | null;
  marginPercent: number | null;
  /** @deprecated Verwende resultAfterDirectCosts. */
  profit: number | null;
}

export interface DashboardReport {
  /** Auszahlungen fuer im Zeitraum erfasste Einkaeufe, nicht der Lagerwert. */
  expenses: number;
  /** Umsatz aus noch nicht retournierten, bestaetigten Verkaeufen. */
  revenue: number;
  /** Verkaufserlös minus Wareneinsatz und direkte Verkaufskosten; kein Prognosewert. */
  realizedProfit: number | null;
  resultAfterDirectCosts: number | null;
  soldItems: number;
  averageMarginPercent: number | null;
  /** Anschaffungswert der aktuell vorhandenen Ware. */
  inventoryCostValue: number | null;
  points: readonly DashboardTimePoint[];
  rows: readonly DashboardSaleRow[];
}

export interface TaxCalculationResult {
  sale_id: string;
  item_title: string;
  sale_date: string;
  tax_mode: TaxMode;
  gross_revenue: number;
  shipping_revenue: number;
  shipping_cost: number;
  total_purchase_cost: number;
  gross_margin: number;
  tax_base: number;
  vat_amount: number;
  input_tax_deductible: number; // Vorsteuer aus Gebühren/Versand
  net_tax_liability: number; // USt-Zahllast = USt - Vorsteuer
  net_profit_after_tax: number;
  invoice_clause: string;
}

export interface TaxPeriodSummary {
  period_label: string; // e.g. "Q1 2026", "Februar 2026", "Gesamtjahr 2026"
  total_sales_count: number;
  gross_revenue: number;
  total_cost_of_goods_sold: number;
  total_gross_margin: number;
  total_vat_due: number;
  total_input_tax: number;
  total_vat_liability: number; // UStVA Zahllast
  net_profit_after_tax: number;
  tax_mode: TaxMode;
}

export interface DatevBookingRecord {
  belegdatum: string;
  belegfeld1: string; // Order / Sale ID
  umsatz: number;
  sollHaben: 'S' | 'H';
  konto: string; // e.g. 8200 (Erlöse § 25a) or 8400
  gegenkonto: string; // e.g. 1200 (Bank) or 1000 (Kasse)
  buchungstext: string;
  kost1?: string;
  ustSatz: number;
}
