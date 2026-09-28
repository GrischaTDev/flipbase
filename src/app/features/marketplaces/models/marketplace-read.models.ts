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
  readonly imageUrls?: readonly string[];
  readonly metrics: MarketplaceMetrics;
  readonly conversationId: string | null;
  readonly direction: 'inbound' | 'outbound' | 'unknown';
  readonly promoted: boolean | null;
  readonly unread: boolean | null;
  readonly brand: string | null;
  readonly size: string | null;
  readonly shipmentStatus: string | null;
  readonly messageType: string | null;
  readonly priceLabel: string | null;
}
export interface MarketplaceProfile extends AccountScope {
  readonly username: string | null;
  readonly displayName: string | null;
  readonly location: string | null;
  readonly bio: string | null;
  readonly imageUrl: string | null;
  readonly feedbackCount: number | null;
  readonly feedbackReputation: number | null;
  readonly positiveFeedbackCount: number | null;
  readonly neutralFeedbackCount: number | null;
  readonly negativeFeedbackCount: number | null;
  readonly itemCount: number | null;
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
