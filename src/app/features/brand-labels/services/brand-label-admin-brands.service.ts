import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  executeLabelBrandEdit,
  loadLabelAdminBrands,
  type LabelBrandAdminTransport,
  type LabelBrandEdit,
} from '../models/brand-label-admin-brands';

@Injectable({ providedIn: 'root' })
export class BrandLabelAdminBrandsService {
  private readonly client = inject(SupabaseService).client as unknown as {
    rpc: LabelBrandAdminTransport;
  };
  private readonly transport: LabelBrandAdminTransport = (name, args) =>
    this.client.rpc(name, args);

  list() {
    return loadLabelAdminBrands(this.transport);
  }
  execute(command: LabelBrandEdit) {
    return executeLabelBrandEdit(this.transport, command);
  }
}
