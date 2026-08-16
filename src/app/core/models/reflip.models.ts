export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Workspace {
  id: string;
  name: string;
  min_roi_percent: number;
  min_profit_amount: number;
  created_at?: string;
  updated_at?: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at?: string;
}

export interface Source {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  created_at?: string;
}

export interface Supplier {
  id: string;
  workspace_id: string;
  name: string;
  contact_info?: string | null;
  notes?: string | null;
  created_at?: string;
}

export type PurchaseType = 'single' | 'mystery_pack' | 'lot' | 'pallet';
export type CostAllocationMode = 'manual' | 'even' | 'value_weighted';

export interface PurchaseCost {
  id?: string;
  purchase_id?: string;
  type: string;
  amount: number;
  description?: string | null;
  created_at?: string;
}

export interface Purchase {
  id: string;
  workspace_id: string;
  type: PurchaseType;
  title: string;
  source_id?: string | null;
  supplier_id?: string | null;
  purchase_date: string;
  purchase_price: number;
  cost_allocation_mode: CostAllocationMode;
  original_url?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  source?: Source;
  supplier?: Supplier;
  costs?: PurchaseCost[];
  items_count?: number;
  total_purchase_cost?: number;
}

export type ItemCondition = 'new' | 'like_new' | 'very_good' | 'used' | 'heavily_used' | 'defective';
export type ItemStatus = 'received' | 'needs_review' | 'researched' | 'ready' | 'listed' | 'reserved' | 'sold' | 'returned' | 'archived' | 'defective';

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
  created_at?: string;
}

export interface InventoryItem {
  id: string;
  workspace_id: string;
  purchase_id?: string | null;
  category?: string | null;
  title: string;
  brand?: string | null;
  model?: string | null;
  condition: ItemCondition;
  status: ItemStatus;
  sku?: string | null;
  ean?: string | null;
  description?: string | null;
  allocated_purchase_cost: number;
  expected_value?: number | null;
  created_at?: string;
  updated_at?: string;
  purchase?: Purchase;
  costs?: ItemCost[];
  media?: ItemMedia[];
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
  query_text: string;
  source: string;
  result_count: number;
  min_price: number;
  max_price: number;
  avg_price: number;
  median_price: number;
  created_at?: string;
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
  platform: 'ebay' | 'kleinanzeigen' | 'vinted';
  title: string;
  description: string;
  price: number;
  status: 'draft' | 'published';
  created_at?: string;
  updated_at?: string;
}

export interface Sale {
  id: string;
  workspace_id: string;
  inventory_item_id: string;
  platform: 'ebay' | 'kleinanzeigen' | 'vinted' | 'direct' | string;
  sale_price: number;
  sale_date: string;
  platform_fee: number;
  shipping_cost: number;
  packaging_cost: number;
  other_costs: number;
  external_order_id?: string | null;
  external_listing_id?: string | null;
  buyer_notes?: string | null;
  created_at?: string;
  inventory_item?: InventoryItem;
  net_profit?: number;
  roi?: number;
  holding_duration_days?: number;
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
