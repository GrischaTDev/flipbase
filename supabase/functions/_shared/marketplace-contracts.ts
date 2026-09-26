/** Gemeinsame Datenverträge ohne Angular-, Deno- oder Node-Laufzeitabhängigkeit. */
export type Marketplace = 'vinted' | 'kleinanzeigen' | 'ebay';

export interface AccountScope {
  readonly workspaceId: string;
  readonly connectionId: string;
}

export type CapabilityState = 'unknown' | 'verified' | 'unsupported' | 'blocked';
export type Capability =
  | 'profile.read'
  | 'listings.read'
  | 'metrics.read'
  | 'conversations.read'
  | 'messages.sendText'
  | 'listings.update'
  | 'listings.publish'
  | 'sales.read';

export type CapabilityMap = Readonly<Partial<Record<Capability, CapabilityState>>>;
export type ConnectionStatus = 'disconnected' | 'needs_login' | 'connected' | 'paused' | 'blocked';

/** Nur öffentliche Verbindungsdaten; Browserprofile und Sitzungsschlüssel bleiben serverseitig. */
export interface MarketplaceConnection extends AccountScope {
  readonly marketplace: Marketplace;
  readonly displayName: string;
  readonly externalAccountId: string | null;
  readonly status: ConnectionStatus;
  readonly capabilities: CapabilityMap;
  /** Serverseitig ermittelte Nutzerrechte; kein Beleg für eine Plattformfreigabe. */
  readonly allowedActions: readonly Capability[];
  readonly lastSyncedAt: string | null;
}

export interface PageRequest {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface CommandPayloads {
  readonly 'profile.read': Readonly<Record<string, never>>;
  readonly 'listings.read': PageRequest;
  readonly 'conversations.read': PageRequest;
  readonly 'sales.read': PageRequest;
  readonly 'metrics.read': { readonly publicationId: string };
  readonly 'messages.sendText': { readonly conversationId: string; readonly text: string };
  readonly 'listings.publish': { readonly listingId: string };
  readonly 'listings.update': { readonly listingId: string; readonly publicationId: string };
}

/** Nutzeridentität kommt aus der serverseitig geprüften Sitzung, niemals aus diesem DTO. */
export type CommandRequest = {
  [Action in Capability]: {
    readonly scope: AccountScope;
    readonly requestId: string;
    readonly action: Action;
    readonly payload: CommandPayloads[Action];
  };
}[Capability];

export type CommandStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'outcome_unknown'
  | 'cancelled';

export interface MarketplaceMetrics {
  /** null bedeutet nicht verfügbar, nicht 0 Aufrufe. */
  readonly views: number | null;
  readonly favorites: number | null;
  readonly observedAt: string | null;
}
