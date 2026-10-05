import type { AccountScope, MarketplaceConnection, MarketplaceMetrics } from './marketplace.models';

export type MarketplaceEntryKind = 'publication' | 'conversation' | 'message' | 'sale' | 'activity';
export interface MarketplacePage<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly nextCursor: string | null;
}
export interface MarketplaceEntry extends AccountScope {
  readonly id: string;
  readonly externalId?: string | null;
  readonly title: string;
  readonly text: string | null;
  readonly textState?: 'loaded' | 'not_loaded';
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
  readonly itemId?: string | null;
  readonly itemTitle?: string | null;
  readonly itemImageUrl?: string | null;
  readonly itemPrice?: number | null;
  readonly itemCurrency?: string | null;
  readonly partnerId?: string | null;
  readonly lastActiveAt?: string | null;
  readonly transactionStatus?: string | null;
  readonly eventType?: string | null;
  readonly eventGroup?: string | null;
  readonly offerStatus?: string | null;
}

export interface LocalMessageAttachment {
  readonly name: string;
  readonly mimeType: 'image/jpeg' | 'image/png';
  readonly base64: string;
}
export interface LocalQueuedMessage {
  readonly id: string;
  readonly requestId: string;
  readonly conversationId: string;
  readonly text: string | null;
  readonly state:
    'queued' | 'claimed' | 'sending' | 'sent' | 'failed' | 'outcome_unknown' | 'cancelled';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly externalMessageId: string | null;
  readonly errorCode: string | null;
  readonly attachment: {
    readonly name: string;
    readonly mimeType: 'image/jpeg' | 'image/png';
  } | null;
}
export interface MarketplaceFeedback {
  readonly id: string;
  readonly authorName: string | null;
  readonly authorImageUrl: string | null;
  readonly rating: number | null;
  readonly text: string;
  readonly occurredAt: string | null;
  readonly isAutomatic: boolean | null;
  readonly itemTitle?: string | null;
}
export interface MarketplaceProfile extends AccountScope {
  readonly username: string | null;
  readonly displayName: string | null;
  readonly location: string | null;
  readonly bio: string | null;
  readonly bioState?: 'loaded' | 'not_loaded';
  readonly imageUrl: string | null;
  readonly feedbackCount: number | null;
  readonly feedbackReputation: number | null;
  readonly positiveFeedbackCount: number | null;
  readonly neutralFeedbackCount: number | null;
  readonly negativeFeedbackCount: number | null;
  readonly itemCount: number | null;
  readonly feedbacks?: readonly MarketplaceFeedback[];
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

export interface MarketplaceAccountPreview extends AccountScope {
  readonly profile: MarketplaceProfile | null;
  readonly publicationCount: number;
  readonly saleCount: number;
}
