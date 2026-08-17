export interface OfflinePurchaseEntry {
  id: string;
  workspace_id: string;
  title: string;
  purchase_price: number;
  estimated_resale_price: number;
  location_name: string;
  category: string;
  condition: string;
  notes?: string;
  photo_data_url?: string;
  captured_at: string;
  sync_status: 'pending' | 'synced' | 'failed';
}

export interface CashWalletSession {
  isActive: boolean;
  startCash: number;
  currentCash: number;
  totalSpent: number;
  estimatedTotalResale: number;
  itemsCount: number;
  locationName: string;
  startedAt: string;
}
