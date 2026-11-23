import { DestroyRef, Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../../core/services/supabase.service';

interface WorkspaceChannel {
  channel: RealtimeChannel;
  listeners: Set<(delta: boolean) => void>;
  timer?: ReturnType<typeof setTimeout>;
  lastRefresh: number;
  snapshotPending: boolean;
  subscribed: boolean;
}

@Injectable({ providedIn: 'root' })
export class DealFeedUpdatesService {
  private readonly client = inject(SupabaseService).client;
  private readonly destroyRef = inject(DestroyRef);
  private readonly channels = new Map<string, WorkspaceChannel>();

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const workspace of [...this.channels.keys()]) {
        this.teardown(workspace);
      }
    });
  }

  /** Mehrere Feed-Spalten desselben Arbeitsbereichs teilen sich einen Realtime-Kanal. */
  watch(workspace: string, onUpdate: (delta: boolean) => void): () => void {
    if (this.destroyRef.destroyed) return () => undefined;
    let active = true;
    const entry = this.ensureChannel(workspace);
    if (!entry) return () => undefined;
    entry.listeners.add(onUpdate);
    if (entry.subscribed) this.scheduleRefresh(workspace, entry, false);

    return () => {
      if (!active) return;
      active = false;
      const current = this.channels.get(workspace);
      if (!current) return;
      current.listeners.delete(onUpdate);
      if (current.listeners.size === 0) this.teardown(workspace);
    };
  }

  private ensureChannel(workspace: string): WorkspaceChannel | null {
    const existing = this.channels.get(workspace);
    if (existing) return existing;
    try {
      const channel = this.client.channel(`workspace:${workspace}:sniper_feed`, {
        config: { private: true },
      });
      const entry: WorkspaceChannel = {
        channel,
        listeners: new Set(),
        lastRefresh: Number.NEGATIVE_INFINITY,
        snapshotPending: false,
        subscribed: false,
      };
      this.channels.set(workspace, entry);
      channel
        .on('broadcast', { event: 'feed_updated' }, (message: { payload?: unknown }) => {
          const payload = message.payload;
          if (
            payload &&
            typeof payload === 'object' &&
            !Array.isArray(payload) &&
            'refresh' in payload &&
            payload.refresh === true
          )
            this.scheduleRefresh(workspace, entry, true);
        })
        .subscribe((status) => {
          // Auch der erste Beitritt schließt die Lücke zwischen Laden und Abonnieren.
          if (status === 'SUBSCRIBED') {
            entry.subscribed = true;
            this.scheduleRefresh(workspace, entry, false);
          }
        });
      return entry;
    } catch {
      // Der regelmäßige Feed-Abruf bleibt auch ohne Echtzeitverbindung aktiv.
      this.teardown(workspace);
      return null;
    }
  }

  private scheduleRefresh(workspace: string, entry: WorkspaceChannel, delta: boolean): void {
    if (this.channels.get(workspace) !== entry) return;
    entry.snapshotPending ||= !delta;
    if (entry.timer !== undefined) return;
    const delay = Math.max(delta ? 0 : 250, 1_000 - (Date.now() - entry.lastRefresh));
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      if (this.channels.get(workspace) !== entry) return;
      entry.lastRefresh = Date.now();
      const useDelta = !entry.snapshotPending;
      entry.snapshotPending = false;
      for (const listener of [...entry.listeners]) listener(useDelta);
    }, delay);
  }

  private teardown(workspace: string): void {
    const entry = this.channels.get(workspace);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.channels.delete(workspace);
    void this.client.removeChannel(entry.channel).catch(() => undefined);
  }
}
