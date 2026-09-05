import { Injectable, inject } from '@angular/core';
import { Json } from '../models/supabase.types';
import { MutationResult } from '../models/mutation-result.model';
import {
  BusinessEvent,
  PurchaseCostAllocationMethod,
  PurchaseCostingResult,
  PurchaseLinePriceMode,
} from '../models/purchase-costing.models';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';

type BusinessEntityType = BusinessEvent['entityType'];
export interface PurchaseCostRepairPreview {
  readonly purchaseId: string;
  readonly fingerprint: string;
  readonly classification: string;
  readonly reason: string;
  readonly purchasePrice: number | null;
  readonly costs: readonly {
    id: string;
    type: string;
    amount: number;
    description: string | null;
  }[];
  readonly items: readonly { id: string; title: string; status: string }[];
}
type PurchaseLineKind = 'quantity' | 'individual';
type PurchaseItemCondition =
  'new' | 'like_new' | 'very_good' | 'used' | 'heavily_used' | 'defective';

export interface CorrectPurchaseLineInput {
  readonly id: string;
  readonly catalog_product_id: string | null;
  readonly title_snapshot: string;
  readonly line_kind: PurchaseLineKind;
  readonly ordered_quantity: number;
  readonly price_mode: PurchaseLinePriceMode;
  readonly unit_purchase_price: number | null;
  readonly line_total: number | null;
  readonly condition_snapshot: PurchaseItemCondition | null;
  readonly estimated_market_value: number | null;
}

export interface CorrectPurchaseCostInput {
  readonly id: string;
  readonly type: string;
  readonly amount: number;
  readonly description: string | null;
  readonly allocation_method: PurchaseCostAllocationMethod;
  readonly target_purchase_line_id: string | null;
}

export interface CorrectPurchaseCostingInput {
  readonly workspaceId: string;
  readonly purchaseId: string;
  readonly reason: string;
  readonly purchasePrice: number | null;
  readonly lines: readonly CorrectPurchaseLineInput[];
  readonly costs: readonly CorrectPurchaseCostInput[];
}

interface RpcResponse {
  readonly data: unknown;
  readonly error: unknown;
}

interface PurchaseCostingRpcClient {
  rpc(name: string, args: Readonly<Record<string, unknown>>): Promise<RpcResponse>;
}

@Injectable({ providedIn: 'root' })
export class PurchaseCostingService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly mockStore = inject(MockDataStoreService);

  async previewCostRepair(
    workspaceId: string,
    purchaseId: string,
  ): Promise<MutationResult<PurchaseCostRepairPreview>> {
    const operation = 'Prüfen der Einkaufskosten';
    if (this.mockStore.isDemoMode()) return this.demoFailure(operation);
    try {
      const { data, error } = await this.rpcClient().rpc('preview_purchase_cost_repair', {
        p_workspace_id: workspaceId,
        p_purchase_id: purchaseId,
      });
      if (error) return this.failure(operation, error);
      if (
        !this.isRecord(data) ||
        data['purchaseId'] !== purchaseId ||
        typeof data['fingerprint'] !== 'string' ||
        !data['fingerprint'] ||
        typeof data['classification'] !== 'string' ||
        typeof data['reason'] !== 'string' ||
        (data['purchasePrice'] !== null && !this.isFiniteNumber(data['purchasePrice'])) ||
        !Array.isArray(data['costs']) ||
        !Array.isArray(data['items'])
      ) {
        throw new Error('Die Kostenvorschau ist unvollständig. Bitte erneut laden.');
      }
      const costs = data['costs'].map((row: unknown) => {
        if (
          !this.isRecord(row) ||
          typeof row['id'] !== 'string' ||
          typeof row['type'] !== 'string' ||
          !this.isFiniteNumber(row['amount']) ||
          (row['description'] !== null && typeof row['description'] !== 'string')
        ) {
          throw new Error('Die Zusatzkosten sind unvollständig.');
        }
        return {
          id: row['id'],
          type: row['type'],
          amount: row['amount'],
          description: row['description'],
        };
      });
      const items = data['items'].map((row: unknown) => {
        if (
          !this.isRecord(row) ||
          typeof row['id'] !== 'string' ||
          typeof row['title'] !== 'string' ||
          typeof row['status'] !== 'string'
        ) {
          throw new Error('Die Artikelliste ist unvollständig.');
        }
        return { id: row['id'], title: row['title'], status: row['status'] };
      });
      return {
        data: {
          purchaseId,
          fingerprint: data['fingerprint'],
          classification: data['classification'],
          reason: data['reason'],
          purchasePrice: data['purchasePrice'],
          costs,
          items,
        },
        error: null,
        reportedBySyncStatus: false,
      };
    } catch (error: unknown) {
      return this.failure(operation, error);
    }
  }

  async repairPurchaseCosts(
    workspaceId: string,
    purchaseId: string,
    fingerprint: string,
  ): Promise<MutationResult<true>> {
    const operation = 'Übernehmen der Einkaufskosten';
    if (!workspaceId || !purchaseId || !fingerprint)
      return this.failure(operation, new Error('Bitte zuerst diesen Einkauf prüfen.'));
    if (this.mockStore.isDemoMode()) return this.demoFailure(operation);
    try {
      const { data, error } = await this.rpcClient().rpc('migrate_purchase_costing_legacy', {
        p_workspace_id: workspaceId,
        p_purchase_id: purchaseId,
        p_expected_fingerprint: fingerprint,
        p_confirm: true,
      });
      if (error) return this.failure(operation, error);
      if (!this.isRecord(data) || data['repaired'] !== 1)
        throw new Error('Der Einkauf konnte nicht übernommen werden. Bitte erneut prüfen.');
      return { data: true, error: null, reportedBySyncStatus: false };
    } catch (error: unknown) {
      return this.failure(operation, error);
    }
  }

  async finalizePurchase(
    workspaceId: string,
    purchaseId: string,
  ): Promise<MutationResult<PurchaseCostingResult>> {
    if (this.mockStore.isDemoMode()) {
      const result = this.mockStore.finalizePurchaseCosting(workspaceId, purchaseId);
      if (result.error || !result.data) {
        return this.failure(
          'Finalisieren des Einkaufs',
          result.error ?? new Error('Die Demo-Finalisierung wurde unvollständig zurückgegeben.'),
        );
      }
      return { data: result.data, error: null, reportedBySyncStatus: false };
    }
    return this.runCostingMutation(
      'Finalisieren des Einkaufs',
      'finalize_purchase_costing',
      { p_workspace_id: workspaceId, p_purchase_id: purchaseId },
      'finalized',
      purchaseId,
    );
  }

  async reopenPurchase(
    workspaceId: string,
    purchaseId: string,
  ): Promise<MutationResult<PurchaseCostingResult>> {
    return this.runCostingMutation(
      'Wiederöffnen des Einkaufs',
      'reopen_purchase_costing',
      { p_workspace_id: workspaceId, p_purchase_id: purchaseId },
      'capturing',
      purchaseId,
    );
  }

  async correctPurchase(
    input: CorrectPurchaseCostingInput,
  ): Promise<MutationResult<PurchaseCostingResult>> {
    return this.runCostingMutation(
      'Korrigieren des Einkaufs',
      'correct_purchase_costing',
      {
        p_workspace_id: input.workspaceId,
        p_purchase_id: input.purchaseId,
        p_reason: input.reason,
        p_purchase_price: input.purchasePrice,
        p_lines: input.lines as unknown as Json,
        p_costs: input.costs as unknown as Json,
      },
      'finalized',
      input.purchaseId,
    );
  }

  async loadEvents(
    workspaceId: string,
    entityType: BusinessEntityType,
    entityId: string,
  ): Promise<MutationResult<readonly BusinessEvent[]>> {
    const operation = 'Laden des Änderungsprotokolls';
    if (!this.isBusinessEntityType(entityType)) {
      return this.failure(operation, new Error('Der Datensatztyp ist ungültig.'));
    }
    if (this.mockStore.isDemoMode()) return this.demoFailure(operation);

    try {
      const { data, error } = await this.rpcClient().rpc('list_entity_business_events', {
        p_workspace_id: workspaceId,
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_cursor_created_at: null,
        p_cursor_id: null,
        p_page_size: 100,
      });
      if (error) return this.failure(operation, error);
      if (!Array.isArray(data)) {
        return this.failure(operation, new Error('Das Änderungsprotokoll ist unvollständig.'));
      }

      const events: BusinessEvent[] = [];
      for (const row of data) {
        const event = this.mapBusinessEvent(row, workspaceId, entityType, entityId);
        if (!event) {
          return this.failure(operation, new Error('Das Änderungsprotokoll ist ungültig.'));
        }
        events.push(event);
      }
      return { data: events, error: null, reportedBySyncStatus: false };
    } catch (error: unknown) {
      return this.failure(operation, error);
    }
  }

  private async runCostingMutation(
    operation: string,
    rpcName: string,
    args: Readonly<Record<string, unknown>>,
    expectedStatus: PurchaseCostingResult['entryStatus'],
    expectedPurchaseId: string,
  ): Promise<MutationResult<PurchaseCostingResult>> {
    if (this.mockStore.isDemoMode()) return this.demoFailure(operation);

    try {
      const { data, error } = await this.rpcClient().rpc(rpcName, args);
      if (error) return this.failure(operation, error);
      const result = this.parseCostingResult(data, expectedStatus, expectedPurchaseId);
      if (!result) {
        return this.failure(operation, new Error('Die Buchungsantwort ist unvollständig.'));
      }
      return { data: result, error: null, reportedBySyncStatus: false };
    } catch (error: unknown) {
      return this.failure(operation, error);
    }
  }

  private parseCostingResult(
    value: unknown,
    expectedStatus: PurchaseCostingResult['entryStatus'],
    expectedPurchaseId: string,
  ): PurchaseCostingResult | null {
    if (!this.isRecord(value)) return null;
    const totalPurchaseCost = value['totalPurchaseCost'];
    let parsedTotalPurchaseCost: number | null;
    if (expectedStatus === 'capturing') {
      if (totalPurchaseCost !== null) return null;
      parsedTotalPurchaseCost = null;
    } else {
      if (!this.isFiniteNumber(totalPurchaseCost)) return null;
      parsedTotalPurchaseCost = totalPurchaseCost;
    }
    if (
      value['purchaseId'] !== expectedPurchaseId ||
      !this.isFiniteNumber(value['allocatedTotalCost']) ||
      value['entryStatus'] !== expectedStatus ||
      typeof value['eventId'] !== 'string' ||
      value['eventId'].length === 0
    ) {
      return null;
    }
    return {
      purchaseId: value['purchaseId'],
      totalPurchaseCost: parsedTotalPurchaseCost,
      allocatedTotalCost: value['allocatedTotalCost'],
      entryStatus: expectedStatus,
      eventId: value['eventId'],
    };
  }

  private mapBusinessEvent(
    value: unknown,
    workspaceId: string,
    entityType: BusinessEntityType,
    entityId: string,
  ): BusinessEvent | null {
    if (
      !this.isRecord(value) ||
      value['workspace_id'] !== workspaceId ||
      value['entity_type'] !== entityType ||
      !this.isBusinessEntityType(value['entity_type']) ||
      value['entity_id'] !== entityId ||
      typeof value['id'] !== 'string' ||
      typeof value['event_type'] !== 'string' ||
      (value['actor_id'] !== null && typeof value['actor_id'] !== 'string') ||
      (value['reason'] !== null && typeof value['reason'] !== 'string') ||
      !this.isRecord(value['changes']) ||
      typeof value['correlation_id'] !== 'string' ||
      typeof value['created_at'] !== 'string'
    ) {
      return null;
    }
    return {
      id: value['id'],
      workspaceId,
      entityType,
      entityId,
      eventType: value['event_type'],
      actorId: value['actor_id'],
      reason: value['reason'],
      changes: value['changes'],
      correlationId: value['correlation_id'],
      createdAt: value['created_at'],
    };
  }

  private rpcClient(): PurchaseCostingRpcClient {
    return this.supabase.client as unknown as PurchaseCostingRpcClient;
  }

  private demoFailure<T>(operation: string): MutationResult<T> {
    return this.failure(
      operation,
      new Error('Diese verbindliche Buchung ist im Demo-Modus nicht verfügbar.'),
    );
  }

  private failure<T>(operation: string, cause: unknown): MutationResult<T> {
    const error = this.syncStatus.melde(operation, cause);
    return { data: null, error, reportedBySyncStatus: this.syncStatus.istZentralGemeldet(error) };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private isBusinessEntityType(value: unknown): value is BusinessEntityType {
    return (
      value === 'purchase' ||
      value === 'inventory_item' ||
      value === 'sale' ||
      value === 'return' ||
      value === 'export'
    );
  }
}
