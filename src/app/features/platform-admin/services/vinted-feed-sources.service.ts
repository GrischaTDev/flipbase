import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  VintedCategorySyncStatus,
  VintedFeedCapacity,
  VintedFeedSettings,
  parseVintedFeedCapacity,
} from '../models/vinted-feed-sources';

/** Liest und steuert die gemeinsamen Vinted-Quellen der persönlichen Feeds. */
@Injectable({ providedIn: 'root' })
export class VintedFeedSourcesService {
  private readonly client = inject(SupabaseService).client;

  async capacity(): Promise<VintedFeedCapacity> {
    const { data, error } = await this.client.rpc('sniper_feed_capacity');
    if (error) throw new Error('Die Vinted-Quellen konnten nicht geladen werden.');
    return parseVintedFeedCapacity(data);
  }

  async saveSettings(settings: VintedFeedSettings): Promise<void> {
    const { error } = await this.client.rpc('set_sniper_feed_settings', {
      p_max_category_sources: settings.maxCategorySources,
      p_category_poll_interval_seconds: settings.categoryPollIntervalSeconds,
    });
    if (error) {
      throw new Error(
        error.code === '22023' && error.message?.trim()
          ? error.message.trim()
          : 'Die Einstellungen konnten nicht gespeichert werden.',
      );
    }
  }

  async categorySync(): Promise<VintedCategorySyncStatus> {
    const { data, error } = await this.client
      .from('vinted_category_syncs')
      .select('refreshed_at, requested_at, last_attempt_at, category_count, last_error')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw new Error('Der Stand der Kategorien konnte nicht geladen werden.');
    return {
      refreshedAt: data?.refreshed_at ?? null,
      requestedAt: data?.requested_at ?? null,
      lastAttemptAt: data?.last_attempt_at ?? null,
      categoryCount: data?.category_count ?? 0,
      lastError: data?.last_error ?? null,
    };
  }

  /**
   * Fordert ein erneutes Einlesen an. Ein Trigger ersetzt den Zeitstempel durch
   * die Datenbankzeit; der Sniper-Dienst liest beim nächsten Takt neu ein.
   */
  async requestCategoryRefresh(): Promise<void> {
    const { error } = await this.client
      .from('vinted_category_syncs')
      .update({ requested_at: new Date().toISOString() })
      .eq('id', 1);
    if (error) throw new Error('Das Neu-Einlesen konnte nicht angefordert werden.');
  }
}
