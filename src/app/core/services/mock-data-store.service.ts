import { Injectable, signal } from '@angular/core';
import {
  Workspace,
  Source,
  Supplier,
  Purchase,
  InventoryItem,
  Sale,
  ActivityLog,
  ItemCost,
} from '../models/reflip.models';

const DEMO_WS_ID = 'demo-workspace-1';

@Injectable({
  providedIn: 'root',
})
export class MockDataStoreService {
  readonly isDemoMode = signal<boolean>(false);

  readonly demoWorkspace: Workspace = {
    id: DEMO_WS_ID,
    name: 'Mein Reselling Business',
    currency: 'EUR',
    min_roi_percent: 30,
    min_profit_amount: 15,
    created_at: new Date().toISOString(),
  };

  readonly demoSources: Source[] = [
    { id: 'src-1', workspace_id: DEMO_WS_ID, name: 'Kleinanzeigen', type: 'online_marketplace', is_active: true },
    { id: 'src-2', workspace_id: DEMO_WS_ID, name: 'eBay', type: 'online_marketplace', is_active: true },
    { id: 'src-3', workspace_id: DEMO_WS_ID, name: 'Vinted', type: 'online_marketplace', is_active: true },
    { id: 'src-4', workspace_id: DEMO_WS_ID, name: 'Flohmarkt', type: 'flea_market', is_active: true },
    { id: 'src-5', workspace_id: DEMO_WS_ID, name: 'B-Stock / Retourenhandel', type: 'b2b_wholesaler', is_active: true },
  ];

  readonly demoSuppliers: Supplier[] = [];

  readonly demoPurchases: Purchase[] = [];

  readonly demoItems: InventoryItem[] = [];

  readonly demoSales: Sale[] = [];

  // Helper with 800ms timeout
  async withTimeout<T>(promiseLike: any, fallback: T, ms: number = 800): Promise<T> {
    const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms));
    try {
      return await Promise.race([Promise.resolve(promiseLike), timeout]);
    } catch {
      return fallback;
    }
  }
}
