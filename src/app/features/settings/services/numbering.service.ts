import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  NumberedEntity,
  NumberSeries,
  NumberSeriesConfiguration,
  NumberSettings,
} from '../models/numbering.models';

@Injectable({ providedIn: 'root' })
export class NumberingService {
  private readonly supabase = inject(SupabaseService);

  async load(workspaceId: string): Promise<NumberSettings> {
    const { data, error } = await this.supabase.client.rpc('get_number_settings', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    return data as unknown as NumberSettings;
  }

  async save(
    workspaceId: string,
    entity: NumberedEntity,
    configuration: NumberSeriesConfiguration,
    timezone: string,
    version: number,
  ): Promise<NumberSeries> {
    const { data, error } = await this.supabase.client.rpc('save_number_series', {
      p_workspace_id: workspaceId,
      p_entity_type: entity,
      p_configuration: { ...configuration, timezone },
      p_expected_version: version,
    });
    if (error) throw error;
    return data as unknown as NumberSeries;
  }
}
