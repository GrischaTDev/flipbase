import { DestroyRef, Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../../core/services/supabase.service';

@Injectable({ providedIn: 'root' })
export class DealFeedUpdatesService {
  private readonly client = inject(SupabaseService).client;
  private readonly destroyRef = inject(DestroyRef);
  private stopWatching?: () => void;

  constructor() {
    this.destroyRef.onDestroy(() => this.stopWatching?.());
  }

  watch(workspace: string, onUpdate: (delta: boolean) => void): () => void {
    this.stopWatching?.();
    let active = true;
    let channel: RealtimeChannel | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastRefresh = Number.NEGATIVE_INFINITY;
    let snapshotPending = false;
    const scheduleRefresh = (delta: boolean) => {
      if (!active) return;
      snapshotPending ||= !delta;
      if (timer !== undefined) return;
      const delay = Math.max(delta ? 0 : 250, 1_000 - (Date.now() - lastRefresh));
      timer = setTimeout(() => {
        timer = undefined;
        if (!active) return;
        lastRefresh = Date.now();
        const useDelta = !snapshotPending;
        snapshotPending = false;
        onUpdate(useDelta);
      }, delay);
    };
    const cleanup = () => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      if (this.stopWatching === cleanup) this.stopWatching = undefined;
      if (channel) void this.client.removeChannel(channel).catch(() => undefined);
    };
    this.stopWatching = cleanup;
    if (this.destroyRef.destroyed) {
      cleanup();
      return cleanup;
    }
    try {
      channel = this.client.channel(`workspace:${workspace}:sniper_feed`, {
        config: { private: true },
      });
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
            scheduleRefresh(true);
        })
        .subscribe((status) => {
          // Auch der erste Beitritt schließt die Lücke zwischen Laden und Abonnieren.
          if (status === 'SUBSCRIBED') scheduleRefresh(false);
        });
    } catch {
      // Der regelmäßige Feed-Abruf bleibt auch ohne Echtzeitverbindung aktiv.
      cleanup();
    }
    return cleanup;
  }
}
