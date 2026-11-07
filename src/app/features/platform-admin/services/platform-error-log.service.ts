import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  PlatformErrorArea,
  PlatformErrorEvent,
  parsePlatformErrorEvents,
} from '../models/platform-error-log';

export const PLATFORM_ERROR_PAGE_SIZE = 100;

/** Liest das zentrale Fehlerprotokoll; nur für Betreiber freigegeben. */
@Injectable({ providedIn: 'root' })
export class PlatformErrorLogService {
  private readonly client = inject(SupabaseService).client;

  async list(
    area: PlatformErrorArea,
    beforeId: number | null = null,
  ): Promise<PlatformErrorEvent[]> {
    const { data, error } = await this.client.rpc('platform_error_events_list', {
      p_area: area,
      p_before_id: beforeId ?? undefined,
      p_limit: PLATFORM_ERROR_PAGE_SIZE,
    });
    if (error) throw new Error(error.message);
    return parsePlatformErrorEvents(data);
  }
}
