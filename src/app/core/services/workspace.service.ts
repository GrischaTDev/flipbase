import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import {
  ConsolidatedHoldingSummary,
  InventoryItem,
  Purchase,
  Sale,
  Workspace,
  WorkspaceSummary,
} from '../models/reflip.models';

const ACTIVE_WORKSPACE_KEY = 'reflip_active_workspace_id';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceService {
  private readonly supabase: SupabaseService | null = null;
  private readonly auth: AuthService | null = null;
  private readonly mockStore: MockDataStoreService | null = null;

  private readonly defaultWorkspaces: Workspace[] = [
    {
      id: 'ws-1',
      name: 'ReFlip Electronics HQ',
      currency: 'EUR',
      tax_mode: 'diff_25a',
      min_roi_percent: 35,
      min_profit_amount: 20,
      created_at: '2026-01-15T08:00:00Z',
    },
    {
      id: 'ws-2',
      name: 'Vintage & Streetwear Studio',
      currency: 'EUR',
      tax_mode: 'diff_25a',
      min_roi_percent: 45,
      min_profit_amount: 15,
      created_at: '2026-03-01T10:00:00Z',
    },
    {
      id: 'ws-3',
      name: 'Flohmarkt & Retouren Outlet',
      currency: 'EUR',
      tax_mode: 'diff_25a',
      min_roi_percent: 50,
      min_profit_amount: 10,
      created_at: '2026-05-10T12:00:00Z',
    },
  ];

  readonly workspaces = signal<Workspace[]>(this.loadPersistedWorkspaces());
  readonly currentWorkspace = signal<Workspace | null>(this.workspaces()[0] || this.defaultWorkspaces[0]);
  readonly isLoading = signal<boolean>(false);

  // Holding consolidation mode toggle (across all tenant workspaces)
  readonly isHoldingConsolidatedMode = signal<boolean>(false);

  constructor() {
    try {
      this.supabase = inject(SupabaseService, { optional: true });
      this.auth = inject(AuthService, { optional: true });
      this.mockStore = inject(MockDataStoreService, { optional: true });
    } catch {
      this.supabase = null;
      this.auth = null;
      this.mockStore = null;
    }

    try {
      effect(() => {
        const isAuth = this.auth?.isAuthenticated();
        const isDemo = this.auth?.isDemoMode();

        if (isDemo || !this.supabase) {
          if (this.workspaces().length === 0) {
            this.workspaces.set(this.defaultWorkspaces);
            this.currentWorkspace.set(this.defaultWorkspaces[0]);
          }
        } else if (isAuth) {
          this.loadWorkspaces();
        }
      });
    } catch {}
  }

  private loadPersistedWorkspaces(): Workspace[] {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('reflip_saved_workspaces');
        if (stored) return JSON.parse(stored);
      }
    } catch {}
    return this.defaultWorkspaces;
  }

  private persistWorkspaces(): void {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('reflip_saved_workspaces', JSON.stringify(this.workspaces()));
      }
    } catch {}
  }

  async loadWorkspaces(): Promise<void> {
    if (this.auth?.isDemoMode() || !this.supabase) {
      if (this.workspaces().length === 0) {
        this.workspaces.set(this.defaultWorkspaces);
        this.currentWorkspace.set(this.defaultWorkspaces[0]);
      }
      return;
    }

    this.isLoading.set(true);
    try {
      const queryPromise = this.supabase.client
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: true });

      const res: any = this.mockStore
        ? await this.mockStore.withTimeout(queryPromise, { data: null, error: new Error('Timeout') }, 800)
        : await queryPromise;

      if (res && !res.error && res.data && res.data.length > 0) {
        const loadedWorkspaces = res.data as Workspace[];
        this.workspaces.set(loadedWorkspaces);

        const storedId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
        const match = loadedWorkspaces.find((w) => w.id === storedId);

        if (match) {
          this.currentWorkspace.set(match);
        } else {
          this.currentWorkspace.set(loadedWorkspaces[0]);
          localStorage.setItem(ACTIVE_WORKSPACE_KEY, loadedWorkspaces[0].id);
        }
      }
    } catch (err) {
      if (this.workspaces().length === 0) {
        this.workspaces.set(this.defaultWorkspaces);
        this.currentWorkspace.set(this.defaultWorkspaces[0]);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  setCurrentWorkspace(workspace: Workspace): void {
    this.currentWorkspace.set(workspace);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspace.id);
      }
    } catch {}
  }

  switchWorkspace(workspaceId: string): void {
    const target = this.workspaces().find((w) => w.id === workspaceId);
    if (target) {
      this.setCurrentWorkspace(target);
    }
  }

  async updateWorkspaceSettings(
    workspaceId: string,
    updates: { min_roi_percent?: number; min_profit_amount?: number; name?: string; currency?: string; tax_mode?: any }
  ): Promise<{ error: Error | null }> {
    const currentList = this.workspaces();
    const updatedList = currentList.map((w) => (w.id === workspaceId ? { ...w, ...updates } : w));
    this.workspaces.set(updatedList);
    this.persistWorkspaces();

    if (this.currentWorkspace()?.id === workspaceId) {
      const updatedCurrent = updatedList.find((w) => w.id === workspaceId);
      if (updatedCurrent) this.currentWorkspace.set(updatedCurrent);
    }

    return { error: null };
  }

  async createWorkspace(name: string): Promise<{ data: Workspace | null; error: Error | null }> {
    const newWs: Workspace = {
      id: `ws-${Date.now()}`,
      name: name.trim(),
      currency: 'EUR',
      tax_mode: 'diff_25a',
      min_roi_percent: 30,
      min_profit_amount: 15,
      created_at: new Date().toISOString(),
    };

    this.workspaces.update((list) => [...list, newWs]);
    this.persistWorkspaces();
    this.setCurrentWorkspace(newWs);
    return { data: newWs, error: null };
  }

  async deleteWorkspace(workspaceId: string): Promise<{ success: boolean }> {
    if (this.workspaces().length <= 1) {
      return { success: false }; // Cannot delete only workspace
    }

    const filtered = this.workspaces().filter((w) => w.id !== workspaceId);
    this.workspaces.set(filtered);
    this.persistWorkspaces();

    if (this.currentWorkspace()?.id === workspaceId) {
      this.setCurrentWorkspace(filtered[0]);
    }

    return { success: true };
  }

  /**
   * Aggregates consolidated holding stats across all registered workspaces.
   */
  getConsolidatedHoldingSummary(
    sales: Sale[] = [],
    purchases: Purchase[] = [],
    items: InventoryItem[] = []
  ): ConsolidatedHoldingSummary {
    const wsList = this.workspaces();

    const summaries: WorkspaceSummary[] = wsList.map((ws) => {
      // If items have workspace_id, filter; otherwise allocate proportionally or calculate totals
      const wsItems = items.filter((i) => !i.workspace_id || i.workspace_id === ws.id || ws.id === 'ws-1');
      const wsPurchases = purchases.filter((p) => !p.workspace_id || p.workspace_id === ws.id || ws.id === 'ws-1');
      const wsSales = sales.filter((s) => !s.workspace_id || s.workspace_id === ws.id || ws.id === 'ws-1');

      const invVal = wsItems
        .filter((i) => i.status !== 'sold' && i.status !== 'returned' && i.status !== 'archived')
        .reduce((sum, i) => sum + (i.allocated_purchase_cost || 0), 0);

      const invested = wsPurchases.reduce((sum, p) => sum + (p.purchase_price || 0) + (p.shipping_cost || 0), 0);
      const revenue = wsSales.reduce((sum, s) => sum + (s.sale_price || 0), 0);
      const profit = wsSales.reduce((sum, s) => sum + (s.net_profit || 0), 0);
      const avgRoi = wsSales.length > 0 ? wsSales.reduce((sum, s) => sum + (s.roi || 0), 0) / wsSales.length : 0;

      return {
        workspace: ws,
        inventoryCount: wsItems.length,
        inventoryValue: Number(invVal.toFixed(2)),
        purchasesCount: wsPurchases.length,
        totalInvested: Number(invested.toFixed(2)),
        salesCount: wsSales.length,
        totalRevenue: Number(revenue.toFixed(2)),
        totalProfit: Number(profit.toFixed(2)),
        roi: Number(avgRoi.toFixed(1)),
        role: 'owner',
      };
    });

    const totalInventoryCount = summaries.reduce((sum, s) => sum + s.inventoryCount, 0);
    const totalInventoryValue = summaries.reduce((sum, s) => sum + s.inventoryValue, 0);
    const totalCapitalInvested = summaries.reduce((sum, s) => sum + s.totalInvested, 0);
    const totalRevenue = summaries.reduce((sum, s) => sum + s.totalRevenue, 0);
    const totalNetProfit = summaries.reduce((sum, s) => sum + s.totalProfit, 0);
    const averageRoi = summaries.length > 0 ? summaries.reduce((sum, s) => sum + s.roi, 0) / summaries.length : 0;

    return {
      workspacesCount: wsList.length,
      totalInventoryCount,
      totalInventoryValue: Number(totalInventoryValue.toFixed(2)),
      totalCapitalInvested: Number(totalCapitalInvested.toFixed(2)),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalNetProfit: Number(totalNetProfit.toFixed(2)),
      averageRoi: Number(averageRoi.toFixed(1)),
      workspaceSummaries: summaries,
    };
  }
}
