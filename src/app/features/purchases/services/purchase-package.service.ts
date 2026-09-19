import { Injectable, inject } from '@angular/core';
import { InventoryItem, ItemCondition, PurchaseLine } from '../../../core/models/flipbase.models';
import { MutationResult } from '../../../core/models/mutation-result.model';
import { InventoryService } from '../../../core/services/inventory.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { SyncStatusService } from '../../../core/services/sync-status.service';
import { WorkspaceService } from '../../../core/services/workspace.service';

export interface PackageContentInput {
  readonly title: string;
  readonly condition: ItemCondition;
  readonly brand?: string | null;
  readonly model?: string | null;
  readonly description?: string | null;
  readonly expected_value?: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

@Injectable({ providedIn: 'root' })
export class PurchasePackageService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly inventory = inject(InventoryService);
  private readonly syncStatus = inject(SyncStatusService);

  async capture(
    lineId: string,
    items: readonly PackageContentInput[],
    requestId: string,
  ): Promise<MutationResult<InventoryItem[]>> {
    const workspaceId = this.workspaceService.currentWorkspace()?.id;
    if (!workspaceId || !lineId || !requestId || !items.length) {
      return {
        data: null,
        error: new Error('Bitte Workspace, Paket und mindestens einen Inhalt angeben.'),
        reportedBySyncStatus: false,
      };
    }
    const conditions: readonly ItemCondition[] = [
      'new',
      'like_new',
      'very_good',
      'used',
      'heavily_used',
      'defective',
    ];
    if (
      items.length > 100 ||
      items.some(
        (item) =>
          !item.title.trim() ||
          item.title.length > 300 ||
          !conditions.includes(item.condition) ||
          (item.description?.length ?? 0) > 5000 ||
          (item.expected_value != null &&
            (!Number.isFinite(item.expected_value) ||
              item.expected_value < 0 ||
              item.expected_value !== Number(item.expected_value.toFixed(2)))),
      )
    ) {
      return {
        data: null,
        error: new Error(
          'Bitte höchstens 100 Inhalte mit gültigem Titel, Zustand und optionalem Wert erfassen.',
        ),
        reportedBySyncStatus: false,
      };
    }
    const payload = items.map((item) => ({
      title: item.title.trim(),
      condition: item.condition,
      brand: item.brand?.trim() || null,
      model: item.model?.trim() || null,
      description: item.description?.trim() || null,
      expected_value: item.expected_value ?? null,
    }));
    let captured: InventoryItem[];
    try {
      const { data, error } = await this.supabase.client.rpc('capture_purchase_package_contents', {
        p_workspace_id: workspaceId,
        p_purchase_line_id: lineId,
        p_items: payload,
        p_request_id: requestId,
      });
      if (error) throw error;
      if (
        !isRecord(data) ||
        !isRecord(data['purchase_line']) ||
        !Array.isArray(data['inventory_items'])
      )
        throw new Error(
          'Die Antwort zum Paketinhalt ist unvollständig. Bitte den Einkauf neu laden.',
        );
      const line = data['purchase_line'];
      const rows: unknown[] = data['inventory_items'];
      if (
        line['id'] !== lineId ||
        line['workspace_id'] !== workspaceId ||
        line['is_package'] !== true ||
        rows.length !== items.length ||
        rows.some(
          (row) =>
            !isRecord(row) ||
            typeof row['id'] !== 'string' ||
            row['workspace_id'] !== workspaceId ||
            row['purchase_id'] !== line['purchase_id'] ||
            row['source_package_line_id'] !== lineId ||
            row['allocated_purchase_cost'] !== null,
        )
      ) {
        throw new Error(
          'Die Herkunft oder Bewertung des Paketinhhalts ist ungültig. Bitte den Einkauf neu laden.',
        );
      }
      captured = rows as InventoryItem[];
    } catch (cause: unknown) {
      const error = this.syncStatus.melde('Paketinhalt erfassen', cause);
      return { data: null, error, reportedBySyncStatus: this.syncStatus.istZentralGemeldet(error) };
    }
    // Ein fehlgeschlagenes Nachladen macht eine bereits gespeicherte Erfassung nicht rückgängig.
    if (this.workspaceService.currentWorkspace()?.id === workspaceId) {
      try {
        await this.inventory.loadInventory(workspaceId);
      } catch (cause: unknown) {
        this.syncStatus.melde('Inventar nach Paketerfassung laden', cause);
      }
    }
    return { data: captured, error: null, reportedBySyncStatus: false };
  }
}

export interface PackageCaptureResult {
  readonly inventory_items: InventoryItem[];
  readonly purchase_line: PurchaseLine;
}
