import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { Json } from '../../../core/models/supabase.types';
import type { VintedListingTemplateFields } from '../models/vinted-listing-content';
import {
  listingResponse,
  parseVintedListingTemplate,
  type VintedListingTemplate,
} from '../models/vinted-listing-draft';

@Injectable({ providedIn: 'root' })
export class VintedListingTemplateService {
  private readonly client = inject(SupabaseService).client;
  async list(workspaceId: string): Promise<readonly VintedListingTemplate[]> {
    const result = listingResponse(
      await this.client.rpc('marketplace_list_listing_templates', { p_workspace_id: workspaceId }),
    );
    if (!Array.isArray(result)) throw new Error('Die Vorlagen konnten nicht gelesen werden.');
    return result.map((value) => parseVintedListingTemplate(value, workspaceId));
  }
  async save(
    workspaceId: string,
    name: string,
    fields: VintedListingTemplateFields,
    existing?: VintedListingTemplate,
  ): Promise<VintedListingTemplate> {
    const id = existing?.id ?? null;
    const revision = existing?.revision ?? null;
    return parseVintedListingTemplate(
      listingResponse(
        await this.client.rpc('marketplace_save_listing_template', {
          // Nullable RPC-Eingänge müssen im JSON enthalten sein; undefined würde den Parameter auslassen.
          p_workspace_id: workspaceId,
          p_id: id!,
          p_expected_revision: revision!,
          p_name: name,
          p_fields: JSON.parse(JSON.stringify(fields)) as Json,
        }),
      ),
      workspaceId,
    );
  }
  async remove(template: VintedListingTemplate): Promise<void> {
    listingResponse(
      await this.client.rpc('marketplace_delete_listing_template', {
        p_workspace_id: template.workspaceId,
        p_id: template.id,
        p_expected_revision: template.revision,
      }),
    );
  }
}
