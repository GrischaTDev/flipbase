import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Workspace } from '../models/reflip.models';

const ACTIVE_WORKSPACE_KEY = 'reflip_active_workspace_id';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  readonly workspaces = signal<Workspace[]>([]);
  readonly currentWorkspace = signal<Workspace | null>(null);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    // Auto-reload workspaces when user logs in
    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        this.loadWorkspaces();
      } else {
        this.workspaces.set([]);
        this.currentWorkspace.set(null);
      }
    });
  }

  async loadWorkspaces(): Promise<void> {
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        const loadedWorkspaces = data as Workspace[];
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
        this.workspaces.set([]);
        this.currentWorkspace.set(null);
      }
    } catch (err) {
      console.error('Error loading workspaces:', err);
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
    if (!user) return { data: null, error: new Error('User not authenticated') };

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
          user_id: user.id,
          role: 'owner',
        });

      if (memErr) {
        return { data: null, error: memErr };
      }

      // 3. Create default sources
      await this.supabase.client.from('sources').insert([
        { workspace_id: ws.id, name: 'Kleinanzeigen', is_default: true },
        { workspace_id: ws.id, name: 'eBay', is_default: false },
        { workspace_id: ws.id, name: 'Vinted', is_default: false },
        { workspace_id: ws.id, name: 'Flohmarkt', is_default: false },
      ]);

      const created = ws as Workspace;
      this.workspaces.update((list) => [...list, created]);
      this.setCurrentWorkspace(created);

      return { data: created, error: null };
    } catch (err: unknown) {
      return { data: null, error: err as Error };
    }
  }
}
