import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { AccountScope } from '../models/marketplace.models';
import { parseVintedActionOverview } from '../models/vinted-action-overview';
import { MarketplaceApiError } from './marketplace-api.service';

@Injectable({ providedIn: 'root' })
export class VintedActionOverviewApiService {
  private readonly client = inject(SupabaseService).client;
  async read(scope: AccountScope) {
    const { data, error } = await this.client.rpc('marketplace_read_action_overview', {
      p_workspace_id: scope.workspaceId,
      p_connection_id: scope.connectionId,
    });
    if (error)
      throw new MarketplaceApiError(error.code === '42501' ? 'forbidden' : 'request_failed');
    return parseVintedActionOverview(data, scope);
  }
}
