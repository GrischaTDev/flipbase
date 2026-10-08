import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

export interface WorkspaceAccess {
  workspace_id: string;
  access_status: string;
  ends_at: string | null;
  server_time: string;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceAccessService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly access = signal<readonly WorkspaceAccess[]>([]);
  readonly error = signal<string | null>(null);
  readonly serverOffset = signal(0);
  private channels: RealtimeChannel[] = [];
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private userId: string | null = null;
  private selectedId: string | null = null;
  private generation = 0;

  constructor() {
    effect(() => {
      const id = this.auth.currentUser()?.id ?? null;
      if (id !== this.userId) {
        this.userId = id;
        this.generation++;
        this.clear();
        if (id) void this.refresh().catch(() => undefined);
      }
    });
    const resume = () => {
      if (this.userId && document.visibilityState === 'visible')
        void this.refresh().catch(() => undefined);
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', resume);
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.clear();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', resume);
    });
  }

  select(workspaceId: string | null): void {
    this.selectedId = workspaceId;
  }

  async refresh(): Promise<readonly WorkspaceAccess[]> {
    const userId = this.auth.currentUser()?.id ?? null;
    if (userId !== this.userId) {
      this.userId = userId;
      this.generation++;
      this.clear();
    }
    const generation = this.generation;
    let rows: readonly WorkspaceAccess[];
    try {
      const { data, error } = await this.supabase.client.rpc('list_my_workspace_access');
      if (error) throw error;
      rows = data ?? [];
    } catch {
      if (generation !== this.generation) return [];
      const message = 'Der Zugang konnte nicht geprüft werden. Bitte versuche es erneut.';
      this.error.set(message);
      if (this.timeout) clearTimeout(this.timeout);
      if (this.userId)
        this.timeout = setTimeout(() => void this.refresh().catch(() => undefined), 5000);
      // Ein Prüfungsfehler bestätigt kein Beta-Ende. Guards bleiben über die Ausnahme gesperrt.
      throw new Error(message);
    }
    if (generation !== this.generation) return [];
    this.error.set(null);
    if (rows[0]) this.serverOffset.set(Date.parse(rows[0].server_time) - Date.now());
    this.access.set(rows);
    if (this.timeout) clearTimeout(this.timeout);
    // Serverzeit als Bezug verwenden; regelmäßige Prüfung fängt verlorene Broadcasts ab.
    const delays = rows
      .filter((row) => row.access_status === 'active' && row.ends_at)
      .map((row) => new Date(row.ends_at!).getTime() - new Date(row.server_time).getTime());
    const delay = Math.max(100, Math.min(30000, ...delays.filter((value) => value > 0)));
    if (this.userId)
      this.timeout = setTimeout(() => void this.refresh().catch(() => undefined), delay);
    const topics = rows.map((row) => `workspace:${row.workspace_id}:access`);
    if (
      topics.join('|') !==
      this.channels.map((channel) => channel.topic.replace(/^realtime:/u, '')).join('|')
    ) {
      for (const channel of this.channels) void this.supabase.client.removeChannel(channel);
      this.channels = topics.map((topic) =>
        this.supabase.client
          .channel(topic, { config: { private: true } })
          .on(
            'broadcast',
            { event: 'workspace_access_changed' },
            () => void this.refresh().catch(() => undefined),
          )
          .subscribe(),
      );
    }
    if (
      this.selectedId &&
      !rows.some((row) => row.workspace_id === this.selectedId && row.access_status === 'active')
    ) {
      this.selectedId = null;
      void this.router.navigate([
        rows.some((row) => row.access_status === 'active') ? '/dashboard' : '/beta-ended',
      ]);
    }
    return rows;
  }

  private clear(): void {
    this.access.set([]);
    this.error.set(null);
    this.selectedId = null;
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    for (const channel of this.channels) void this.supabase.client.removeChannel(channel);
    this.channels = [];
  }
}
