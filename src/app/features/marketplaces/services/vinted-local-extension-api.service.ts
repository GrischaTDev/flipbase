import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { AccountScope } from '../models/marketplace.models';
import {
  parseLocalExtensionApproval,
  parseLocalExtensionStatus,
  parseLocalExtensionRevocation,
} from '../../../../../supabase/functions/_shared/marketplace-local-extension-contracts';
import { MarketplaceApiError } from './marketplace-api.service';
import { MarketplaceResponseError } from '../models/marketplace-response';

function resultOf(result: { data: unknown; error: { code?: string } | null }): unknown {
  if (result.error)
    throw new MarketplaceApiError(
      result.error.code === '42501'
        ? 'forbidden'
        : result.error.code === 'PGRST202'
          ? 'unavailable'
          : 'request_failed',
    );
  return result.data;
}
@Injectable({ providedIn: 'root' })
export class VintedLocalExtensionApiService {
  private readonly client = inject(SupabaseService).client;
  async approve(scope: AccountScope, tokenHash: string, externalAccountId: string) {
    const approval = parseLocalExtensionApproval(
      resultOf(
        await this.client.rpc('marketplace_approve_local_extension', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
          p_token_hash: tokenHash,
          p_expected_external_account_id: externalAccountId,
        }),
      ),
      scope,
    );
    if (!approval || approval.externalAccountId !== externalAccountId)
      throw new MarketplaceResponseError();
    return approval;
  }
  async read(scope: AccountScope) {
    const status = parseLocalExtensionStatus(
      resultOf(
        await this.client.rpc('marketplace_read_local_extension', {
          p_workspace_id: scope.workspaceId,
          p_connection_id: scope.connectionId,
        }),
      ),
    );
    if (!status) throw new MarketplaceResponseError();
    return status.binding;
  }
  async revoke(scope: AccountScope): Promise<void> {
    if (
      !parseLocalExtensionRevocation(
        resultOf(
          await this.client.rpc('marketplace_revoke_local_extension', {
            p_workspace_id: scope.workspaceId,
            p_connection_id: scope.connectionId,
          }),
        ),
      )
    )
      throw new MarketplaceResponseError();
  }
}
