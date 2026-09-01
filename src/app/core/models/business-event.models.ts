import { Json } from './supabase.types';

export type BusinessEntityType = 'purchase' | 'inventory_item' | 'sale' | 'return' | 'export';

export interface BusinessEvent {
  readonly id: string;
  readonly workspaceId: string;
  readonly entityType: BusinessEntityType;
  readonly entityId: string;
  readonly eventType: string;
  readonly eventLabel: string;
  readonly actorId: string | null;
  readonly reason: string | null;
  readonly changes: Json;
  readonly correlationId: string;
  readonly createdAt: string;
}

export interface BusinessEventFilter {
  readonly workspaceId: string;
  readonly entityType?: BusinessEntityType;
  readonly entityId?: string;
  readonly eventType?: string;
  readonly actorId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly cursor?: string;
  readonly pageSize: number;
}

export interface EntityBusinessEventFilter {
  readonly workspaceId: string;
  readonly entityType: BusinessEntityType;
  readonly entityId: string;
  readonly cursor?: string;
  readonly pageSize: number;
}

export interface BusinessEventPage {
  readonly events: readonly BusinessEvent[];
  readonly nextCursor: string | null;
}

export interface AuditExportManifest {
  readonly schemaVersion: string;
  readonly exportVersion: string;
  readonly createdAt: string;
  readonly workspaceId: string;
  readonly filters: Readonly<Record<string, string | number | null>>;
  readonly files: readonly {
    readonly name: string;
    readonly rows: number;
    readonly sha256: string | null;
  }[];
}
