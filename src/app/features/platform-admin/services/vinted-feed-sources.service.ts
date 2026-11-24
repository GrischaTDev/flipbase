import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
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
}
