import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { Database } from '../../../core/models/supabase.types';
import {
  executeLabelBrandArchive,
  executeLabelBrandEdit,
  loadLabelAdminBrands,
  type LabelBrandArchiveCommand,
  type LabelBrandEdit,
} from '../models/brand-label-admin-brands';
@Injectable({ providedIn: 'root' })
export class BrandLabelAdminBrandsService {
  private readonly client = inject(SupabaseService).client;
  list() {
    return loadLabelAdminBrands(() => this.client.rpc('list_label_admin_brands'));
  }
  execute(command: LabelBrandEdit) {
    return executeLabelBrandEdit(
      (_name, args) =>
        this.client.rpc(
          command.kind === 'brand' ? 'save_label_brand' : 'save_label_brand_line',
          args as Database['public']['Functions']['save_label_brand']['Args'],
        ),
      command,
    );
  }
  archive(command: LabelBrandArchiveCommand) {
    return executeLabelBrandArchive(
      () =>
        this.client.rpc('set_label_brand_archive', {
          p_id: command.id,
          p_expected_version: command.expectedVersion,
          p_archived: command.archived,
          p_line: command.kind === 'line',
          p_request_id: command.requestId,
        }),
      command,
    );
  }
}
