import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { PlatformSystemHealth, parsePlatformSystemHealth } from '../models/platform-system-health';

@Injectable({ providedIn: 'root' })
export class PlatformSystemService {
  private readonly client = inject(SupabaseService).client;

  async health(): Promise<PlatformSystemHealth> {
    const { data, error } = await this.client.rpc('platform_system_health');
    if (error) throw new Error(error.message);
    return parsePlatformSystemHealth(data);
  }
}
