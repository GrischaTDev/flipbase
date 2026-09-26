import type { AccountScope, MarketplaceConnection, MarketplaceMetrics } from './marketplace.models';

export type MarketplaceEntryKind = 'publication' | 'conversation' | 'message' | 'sale' | 'activity';
export interface MarketplacePage<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly nextCursor: string | null;
}
export interface MarketplaceEntry extends AccountScope {
  readonly id: string;
  readonly title: string;
  readonly text: string | null;
  readonly occurredAt: string | null;
  readonly price: number | null;
  readonly currency: string;
  readonly status: string | null;
  readonly imageUrl: string | null;
  readonly metrics: MarketplaceMetrics;
  readonly conversationId: string | null;
  readonly direction: 'inbound' | 'outbound' | 'unknown';
}
export interface MarketplaceProfile extends AccountScope {
  readonly username: string | null;
  readonly displayName: string | null;
  readonly location: string | null;
  readonly bio: string | null;
}
export interface MarketplaceSnapshot extends AccountScope {
  readonly profile: MarketplaceProfile | null;
  readonly publications: MarketplacePage<MarketplaceEntry>;
  readonly conversations: MarketplacePage<MarketplaceEntry>;
  readonly sales: MarketplacePage<MarketplaceEntry>;
  readonly activity: MarketplacePage<MarketplaceEntry>;
}
export interface MarketplaceConnectionList {
  readonly canManage: boolean;
  readonly connections: readonly MarketplaceConnection[];
}
