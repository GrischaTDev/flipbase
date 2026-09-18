import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceContextLockService } from './workspace-context-lock.service';
import {
  ConsolidatedHoldingSummary,
  InventoryItem,
  Purchase,
  Sale,
  TaxMode,
  Workspace,
  WorkspaceSummary,
} from '../models/flipbase.models';

import {
  averageKnownAmounts,
  reportedSaleProfit,
  reportedSaleRoi,
  roundKnownAmount,
  sumKnownAmounts,
} from '../utils/financial-summary';

const ACTIVE_WORKSPACE_KEY = 'flipbase_active_workspace_id';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  private readonly syncStatus = inject(SyncStatusService, { optional: true })!;
  private readonly auth = inject(AuthService, { optional: true });
  private readonly mockStore = inject(MockDataStoreService, { optional: true });
  private readonly workspaceContext = inject(WorkspaceContextLockService, { optional: true });
  private readonly router = inject(Router, { optional: true });

  private readonly defaultWorkspaces: Workspace[] = [
    {
      id: 'ws-1',
      name: 'Flipbase Electronics HQ',
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

  // Bewusst leer starten. Zuvor standen hier die Mock-Workspaces, wodurch alle
  // abhaengigen Effects sofort mit der Kennung "ws-1" feuerten und die Datenbank
  // mit einer ungueltigen UUID abfragten (22P02). Die echten Workspaces setzt
  // der Effect unten, sobald die Anmeldung steht.
  readonly workspaces = signal<Workspace[]>([]);
  readonly currentWorkspace = signal<Workspace | null>(null);
  readonly isLoading = signal<boolean>(false);

  // Holding consolidation mode toggle (across all tenant workspaces)
  readonly isHoldingConsolidatedMode = signal<boolean>(false);

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const isAuth = this.auth?.isAuthenticated();
        const isDemo = this.auth?.isDemoMode();

        if (isDemo || !this.supabase) {
          this.workspaces.set(this.defaultWorkspaces);
          this.currentWorkspace.set(this.defaultWorkspaces[0]);
        } else if (isAuth) {
          this.loadWorkspaces();
        } else {
          this.workspaces.set([]);
          this.currentWorkspace.set(null);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  async loadWorkspaces(): Promise<void> {
    if (this.auth?.isDemoMode() || !this.supabase) {
      this.workspaces.set(this.defaultWorkspaces);
      this.currentWorkspace.set(this.defaultWorkspaces[0]);
      return;
    }

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        this.syncStatus.melde('Laden der Workspaces', error);
        this.workspaces.set([]);
        this.currentWorkspace.set(null);
      } else if (data && data.length > 0) {
        const loadedWorkspaces = data as Workspace[];
        this.workspaces.set(loadedWorkspaces);

        const storedId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
        const match = loadedWorkspaces.find((w) => w.id === storedId);

        if (match) {
          this.currentWorkspace.set(match);
        } else {
          this.currentWorkspace.set(loadedWorkspaces[0]);
          localStorage.setItem(ACTIVE_WORKSPACE_KEY, loadedWorkspaces[0].id);
        }
      } else {
        this.workspaces.set([]);
        this.currentWorkspace.set(null);
      }
    } catch (err) {
      this.syncStatus.melde('Laden der Workspaces', err);
      this.workspaces.set([]);
      this.currentWorkspace.set(null);
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

  private persistWorkspaces(): void {
    try {
      if (typeof window !== 'undefined' && this.auth?.isDemoMode()) {
        localStorage.setItem('flipbase_saved_workspaces', JSON.stringify(this.workspaces()));
      }
    } catch {}
  }

  switchWorkspace(workspaceId: string): boolean {
    if (this.workspaceContext?.locked()) return false;
    const target = this.workspaces().find((w) => w.id === workspaceId);
    if (!target) return false;
    this.setCurrentWorkspace(target);
    return true;
  }

  async updateWorkspaceSettings(
    workspaceId: string,
    updates: {
      min_roi_percent?: number;
      min_profit_amount?: number;
      name?: string;
      currency?: string;
      tax_mode?: TaxMode;
    },
  ): Promise<{ error: Error | null }> {
    const currentList = this.workspaces();
    const updatedList = currentList.map((w) => (w.id === workspaceId ? { ...w, ...updates } : w));
    this.workspaces.set(updatedList);
    this.persistWorkspaces();

    if (this.currentWorkspace()?.id === workspaceId) {
      const updatedCurrent = updatedList.find((w) => w.id === workspaceId);
      if (updatedCurrent) this.currentWorkspace.set(updatedCurrent);
    }

    if (this.supabase && this.auth?.isAuthenticated() && !this.auth.isDemoMode()) {
      try {
        const { error } = await this.supabase.client
          .from('workspaces')
          .update({
            name: updates.name,
            min_roi_percent: updates.min_roi_percent,
            min_profit_amount: updates.min_profit_amount,
            currency: updates.currency,
            tax_mode: updates.tax_mode,
            updated_at: new Date().toISOString(),
          })
          .eq('id', workspaceId);

        if (error) {
          return { error: this.syncStatus.melde('Aktualisieren des Workspace', error) };
        }
      } catch (err: unknown) {
        return { error: this.syncStatus.melde('Aktualisieren des Workspace', err) };
      }
    }

    return { error: null };
  }

  async createWorkspace(name: string): Promise<{ data: Workspace | null; error: Error | null }> {
    if (this.workspaceContext?.locked()) {
      return {
        data: null,
        error: new Error(
          'Während einer laufenden Erfassung kann kein neuer Workspace erstellt werden. Speichere oder verlasse die Erfassung zuerst.',
        ),
      };
    }

    const newWs: Workspace = {
      id: `ws-${Date.now()}`,
      name: name.trim(),
      currency: 'EUR',
      tax_mode: 'diff_25a',
      min_roi_percent: 30,
      min_profit_amount: 15,
      created_at: new Date().toISOString(),
    };

    if (this.supabase && this.auth?.isAuthenticated() && !this.auth.isDemoMode()) {
      try {
        const { data: newId, error } = await this.supabase.client.rpc('create_workspace', {
          p_name: name.trim(),
        });

        if (error) {
          return {
            data: null,
            error: this.syncStatus.melde('Erstellen des Workspace über RPC', error),
          };
        } else if (newId) {
          const dbWs: Workspace = { ...newWs, id: newId };
          this.workspaces.update((list) => [...list, dbWs]);
          this.persistWorkspaces();
          await this.activateCreatedWorkspace(dbWs);
          return { data: dbWs, error: null };
        }
      } catch (err: unknown) {
        return { data: null, error: this.syncStatus.melde('Erstellen des Workspace', err) };
      }
    }

    this.workspaces.update((list) => [...list, newWs]);
    this.persistWorkspaces();
    await this.activateCreatedWorkspace(newWs);
    return { data: newWs, error: null };
  }

  private async activateCreatedWorkspace(workspace: Workspace): Promise<void> {
    this.setCurrentWorkspace(workspace);
    if (this.router) await this.router.navigate(['/dashboard']);
  }

  archiveWorkspace(workspaceId: string): Promise<{ error: Error | null }> {
    return this.setArchiveState(workspaceId, 'archive_workspace');
  }

  restoreWorkspace(workspaceId: string): Promise<{ error: Error | null }> {
    return this.setArchiveState(workspaceId, 'restore_workspace');
  }

  private async setArchiveState(
    workspaceId: string,
    operation: 'archive_workspace' | 'restore_workspace',
  ): Promise<{ error: Error | null }> {
    if (!this.supabase || this.auth?.isDemoMode() || !this.auth?.isAuthenticated()) {
      return {
        error: new Error('Archivieren und Wiederherstellen sind im Demo-Modus nicht verfügbar.'),
      };
    }
    try {
      const { data, error } = await this.supabase.client.rpc(operation, {
        p_workspace_id: workspaceId,
      });
      if (error) return { error: new Error(error.message) };
      if (!data || data.id !== workspaceId) {
        return { error: new Error('Die Änderung wurde von der Datenbank nicht bestätigt.') };
      }
      const updated = data as Workspace;
      this.workspaces.update((workspaces) =>
        workspaces.map((workspace) => (workspace.id === workspaceId ? updated : workspace)),
      );
      if (this.currentWorkspace()?.id === workspaceId) this.currentWorkspace.set(updated);
      return { error: null };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error : new Error('Der Workspace konnte nicht geändert werden.'),
      };
    }
  }

  async deleteWorkspace(
    workspaceId: string,
  ): Promise<{ success: boolean; reportedBySyncStatus: boolean; retentionBlocked?: boolean }> {
    if (this.workspaces().length <= 1) {
      return { success: false, reportedBySyncStatus: false }; // Cannot delete only workspace
    }

    if (this.supabase && this.auth?.isAuthenticated() && !this.auth.isDemoMode()) {
      try {
        const { data, error } = await this.supabase.client
          .from('workspaces')
          .delete()
          .eq('id', workspaceId)
          .select('id')
          .maybeSingle();
        if (error || !data) {
          this.syncStatus.melde(
            'Löschen des Workspace',
            error ??
              new Error('Die Löschung des Workspace wurde von der Datenbank nicht bestätigt.'),
          );
          return {
            success: false,
            reportedBySyncStatus: true,
            ...(error?.code === 'P0001' && error.message.includes('Geschäftsdaten')
              ? { retentionBlocked: true }
              : {}),
          };
        }
      } catch (err) {
        this.syncStatus.melde('Löschen des Workspace', err);
        return { success: false, reportedBySyncStatus: true };
      }
    }

    const filtered = this.workspaces().filter((w) => w.id !== workspaceId);
    this.workspaces.set(filtered);
    this.persistWorkspaces();

    if (this.currentWorkspace()?.id === workspaceId) {
      this.setCurrentWorkspace(filtered[0]);
    }

    return { success: true, reportedBySyncStatus: false };
  }

  /**
   * Aggregates consolidated holding stats across all registered workspaces.
   */
  getConsolidatedHoldingSummary(
    sales: Sale[] = [],
    purchases: Purchase[] = [],
    items: InventoryItem[] = [],
  ): ConsolidatedHoldingSummary {
    const wsList = this.workspaces();

    const summaries: WorkspaceSummary[] = wsList.map((ws) => {
      const wsItems = items.filter((item) => item.workspace_id === ws.id);
      const wsPurchases = purchases.filter((purchase) => purchase.workspace_id === ws.id);
      const wsSales = sales.filter(
        (sale) => sale.workspace_id === ws.id && !sale.returned_at && !sale.voided_at,
      );
      const activeItems = wsItems.filter(
        (item) =>
          item.status !== 'sold' &&
          item.status !== 'returned' &&
          item.status !== 'archived' &&
          !item.archived_at,
      );
      const invVal = sumKnownAmounts(activeItems.map((item) => item.allocated_purchase_cost));

      const invested = wsPurchases.reduce(
        (sum, purchase) => sum + (this.purchaseCostPreview(purchase) ?? 0),
        0,
      );
      const revenue = wsSales.reduce((sum, s) => sum + (s.sale_price || 0), 0);
      const profit = sumKnownAmounts(wsSales.map(reportedSaleProfit));
      const avgRoi = averageKnownAmounts(wsSales.map(reportedSaleRoi));

      return {
        workspace: ws,
        inventoryCount: activeItems.length,
        inventoryValue: roundKnownAmount(invVal),
        purchasesCount: wsPurchases.length,
        totalInvested: Number(invested.toFixed(2)),
        salesCount: wsSales.length,
        totalRevenue: Number(revenue.toFixed(2)),
        totalProfit: roundKnownAmount(profit),
        roi: avgRoi,
        role: 'owner',
      };
    });

    const totalInventoryCount = summaries.reduce((sum, s) => sum + s.inventoryCount, 0);
    const totalInventoryValue = sumKnownAmounts(summaries.map((summary) => summary.inventoryValue));
    const totalCapitalInvested = summaries.reduce((sum, s) => sum + s.totalInvested, 0);
    const totalRevenue = summaries.reduce((sum, s) => sum + s.totalRevenue, 0);
    const totalNetProfit = sumKnownAmounts(summaries.map((summary) => summary.totalProfit));
    const averageRoi = averageKnownAmounts(summaries.map((summary) => summary.roi));

    return {
      workspacesCount: wsList.length,
      totalInventoryCount,
      totalInventoryValue: roundKnownAmount(totalInventoryValue),
      totalCapitalInvested: Number(totalCapitalInvested.toFixed(2)),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalNetProfit: roundKnownAmount(totalNetProfit),
      averageRoi,
      workspaceSummaries: summaries,
    };
  }

  private purchaseCostPreview(purchase: Purchase): number | null {
    if (purchase.purchase_price === null) return null;
    if (purchase.total_purchase_cost !== undefined && purchase.total_purchase_cost !== null) {
      return purchase.total_purchase_cost;
    }
    return (
      purchase.purchase_price +
      (purchase.shipping_cost || 0) +
      (purchase.other_costs || 0) +
      (purchase.costs ?? []).reduce((sum, cost) => sum + Number(cost.amount || 0), 0)
    );
  }
}
