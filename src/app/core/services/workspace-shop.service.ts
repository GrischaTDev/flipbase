import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { isWorkspaceShopActive, WorkspaceShopState } from '../models/workspace-shop.models';

@Injectable({ providedIn: 'root' })
export class WorkspaceShopService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspace = inject(WorkspaceService);
  private readonly destroyRef = inject(DestroyRef);
  readonly active = computed(() => isWorkspaceShopActive(this.workspace.currentWorkspace()));
  readonly entitled = computed(() => this.workspace.currentWorkspace()?.shop_entitled ?? false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  private selectedId: string | null = null;
  private generation = 0;
  private request = 0;
  private channel: RealtimeChannel | null = null;

  constructor() {
    effect(() => {
      const id = this.workspace.currentWorkspace()?.id ?? null;
      if (id === this.selectedId) return;
      this.selectedId = id;
      this.generation++;
      this.saving.set(false);
      this.error.set(null);
      if (this.channel) void this.supabase.client.removeChannel(this.channel);
      this.channel = null;
      if (id)
        untracked(() => {
          void this.refresh();
          if (typeof this.supabase.client.channel === 'function')
            this.channel = this.supabase.client
              .channel(`workspace:${id}:shop`, { config: { private: true } })
              .on('broadcast', { event: 'workspace_shop_changed' }, () => void this.refresh())
              .subscribe();
        });
    });
    const resume = () => {
      if (document.visibilityState === 'visible') void this.refresh();
    };
    const timer = setInterval(() => void this.refresh(), 30000);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', resume);
    this.destroyRef.onDestroy(() => {
      this.generation++;
      clearInterval(timer);
      if (this.channel) void this.supabase.client.removeChannel(this.channel);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', resume);
    });
  }

  async refresh(): Promise<void> {
    const id = this.workspace.currentWorkspace()?.id ?? this.selectedId;
    if (!id) return;
    const generation = this.generation;
    const request = ++this.request;
    try {
      const { data, error } = await this.supabase.client.rpc('get_workspace_shop_state', {
        p_workspace_id: id,
      });
      if (error) throw error;
      if (generation !== this.generation || request !== this.request) return;
      this.apply(data);
      this.error.set(null);
    } catch {
      if (generation === this.generation && request === this.request)
        this.error.set('Die Shop-Einstellung konnte nicht geladen werden.');
    }
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    const current = this.workspace.currentWorkspace();
    if (!current || this.saving()) return false;
    const generation = this.generation;
    this.saving.set(true);
    this.error.set(null);
    try {
      const { data, error } = await this.supabase.client.rpc('set_workspace_shop_enabled', {
        p_workspace_id: current.id,
        p_enabled: enabled,
        p_expected_version: current.shop_version ?? 0,
      });
      if (error) throw new Error(error.message);
      if (generation !== this.generation) return false;
      this.apply(data);
      return true;
    } catch (cause: unknown) {
      if (generation === this.generation) {
        await this.refresh();
        this.error.set(
          cause instanceof Error
            ? cause.message
            : 'Die Shop-Einstellung konnte nicht gespeichert werden.',
        );
      }
      return false;
    } finally {
      if (generation === this.generation) this.saving.set(false);
    }
  }

  private apply(value: unknown): void {
    if (!value || typeof value !== 'object') throw new Error('Shop-Einstellung fehlt.');
    const state = value as WorkspaceShopState;
    if (
      typeof state.shop_enabled !== 'boolean' ||
      typeof state.shop_entitled !== 'boolean' ||
      !Number.isSafeInteger(state.shop_version)
    )
      throw new Error('Shop-Einstellung unvollständig.');
    const current = this.workspace.currentWorkspace();
    if (
      !current ||
      current.id !== state.workspace_id ||
      state.shop_version < (current.shop_version ?? 0)
    )
      return;
    if (
      current.shop_enabled === state.shop_enabled &&
      current.shop_entitled === state.shop_entitled &&
      current.shop_version === state.shop_version
    )
      return;
    const update = {
      ...current,
      shop_enabled: state.shop_enabled,
      shop_entitled: state.shop_entitled,
      shop_version: state.shop_version,
    };
    this.workspace.workspaces.update((rows) =>
      rows.map((row) => (row.id === current.id ? { ...row, ...update } : row)),
    );
    this.workspace.currentWorkspace.set(update);
  }
}
