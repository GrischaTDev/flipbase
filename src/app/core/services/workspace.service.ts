import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import { Workspace } from '../models/reflip.models';

const ACTIVE_WORKSPACE_KEY = 'reflip_active_workspace_id';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly mockStore = inject(MockDataStoreService);

  readonly workspaces = signal<Workspace[]>([this.mockStore.demoWorkspace]);
  readonly currentWorkspace = signal<Workspace | null>(this.mockStore.demoWorkspace);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    // Auto-reload workspaces when user logs in
    effect(() => {
      const isAuth = this.auth.isAuthenticated();
      const isDemo = this.auth.isDemoUser();

      if (isDemo) {
        this.workspaces.set([this.mockStore.demoWorkspace]);
        this.currentWorkspace.set(this.mockStore.demoWorkspace);
      } else if (isAuth) {
        this.loadWorkspaces();
      } else {
        this.workspaces.set([]);
        this.currentWorkspace.set(null);
      }
    });
  }

  async loadWorkspaces(): Promise<void> {
    if (this.auth.isDemoUser()) {
      this.workspaces.set([this.mockStore.demoWorkspace]);
      this.currentWorkspace.set(this.mockStore.demoWorkspace);
      return;
    }

    this.isLoading.set(true);
    try {
      const queryPromise = this.supabase.client
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: true });

      const res: any = await this.mockStore.withTimeout(queryPromise, { data: null, error: new Error('Timeout') }, 800);

      if (res && !res.error && res.data && res.data.length > 0) {
        const loadedWorkspaces = res.data as Workspace[];
        this.workspaces.set(loadedWorkspaces);

        // Check if previously stored workspace is available
        const storedId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
        const match = loadedWorkspaces.find((w) => w.id === storedId);

        if (match) {
          this.currentWorkspace.set(match);
        } else {
          this.currentWorkspace.set(loadedWorkspaces[0]);
          localStorage.setItem(ACTIVE_WORKSPACE_KEY, loadedWorkspaces[0].id);
        }
      } else {
        // Fallback to demo workspace so user never gets stuck
        this.workspaces.set([this.mockStore.demoWorkspace]);
        this.currentWorkspace.set(this.mockStore.demoWorkspace);
      }
    } catch (err) {
      this.workspaces.set([this.mockStore.demoWorkspace]);
      this.currentWorkspace.set(this.mockStore.demoWorkspace);
    } finally {
      this.isLoading.set(false);
    }
  }

  setCurrentWorkspace(workspace: Workspace): void {
    this.currentWorkspace.set(workspace);
    localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspace.id);
  }

  async updateWorkspaceSettings(
    workspaceId: string,
    updates: { min_roi_percent?: number; min_profit_amount?: number; name?: string }
  ): Promise<{ error: Error | null }> {
    if (this.auth.isDemoUser()) {
      const current = this.currentWorkspace();
      if (current) {
        const updated = { ...current, ...updates };
        this.currentWorkspace.set(updated);
        this.workspaces.set([updated]);
      }
      return { error: null };
    }

    try {
      const { data, error } = await this.supabase.client
        .from('workspaces')
        .update(updates)
        .eq('id', workspaceId)
        .select()
        .single();

      if (error) {
        return { error };
      }

      if (data) {
        const updated = data as Workspace;
        this.workspaces.update((list) =>
          list.map((w) => (w.id === updated.id ? updated : w))
        );
        if (this.currentWorkspace()?.id === updated.id) {
          this.currentWorkspace.set(updated);
        }
      }
      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }

  async createWorkspace(name: string): Promise<{ data: Workspace | null; error: Error | null }> {
    const user = this.auth.currentUser();
    if (!user && !this.auth.isDemoUser()) return { data: null, error: new Error('User not authenticated') };

    if (this.auth.isDemoUser()) {
      const newWs: Workspace = {
        id: `ws-${Date.now()}`,
        name,
        currency: 'EUR',
        min_roi_percent: 30,
        min_profit_amount: 15,
        created_at: new Date().toISOString(),
      };
      this.workspaces.update((list) => [...list, newWs]);
      this.setCurrentWorkspace(newWs);
      return { data: newWs, error: null };
    }

    try {
      // 1. Create workspace
      const { data: ws, error: wsErr } = await this.supabase.client
        .from('workspaces')
        .insert({ name })
        .select()
        .single();

      if (wsErr || !ws) {
        return { data: null, error: wsErr };
      }

      // 2. Add membership
      const { error: memErr } = await this.supabase.client
        .from('workspace_members')
        .insert({
          workspace_id: ws.id,
          user_id: user!.id,
          role: 'owner',
        });

      if (memErr) {
        return { data: null, error: memErr };
      }

      await this.loadWorkspaces();
      return { data: ws as Workspace, error: null };
    } catch (err: unknown) {
      return { data: null, error: err as Error };
    }
  }
}
