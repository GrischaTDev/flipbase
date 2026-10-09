export type NegotiationMessageEvent =
  | 'accepted'
  | 'counter'
  | 'final'
  | 'after_final'
  | 'after_acceptance'
  | 'buyer_accepted'
  | 'purchased';

export interface NegotiationMessageStep {
  readonly templates: readonly string[];
  readonly delaySeconds: number;
}

export interface NegotiationDiscount {
  readonly discountType: 'amount' | 'percentage';
  readonly discountValue: number;
}

export interface VintedNegotiationConfig extends NegotiationDiscount {
  readonly priceBands: readonly (NegotiationDiscount & { readonly upToCents: number | null })[];
  readonly stages: readonly number[];
  readonly delaySeconds: number;
  readonly sendOrder: 'offer_first' | 'message_first';
  readonly purchaseEnabled: boolean;
  readonly messages: Readonly<Record<NegotiationMessageEvent, readonly NegotiationMessageStep[]>>;
}

export interface MarketplaceNegotiationOffer {
  readonly offerId: string;
  readonly transactionId: string;
  readonly itemId: string;
  readonly buyerId: string;
  readonly sellerId: string;
  readonly originalPriceCents: number;
  readonly offeredPriceCents: number;
  readonly currency: 'EUR';
  readonly status: 'pending';
}

export type MarketplaceNegotiationEvent = {
  readonly id: string;
  readonly type: 'buyer_accepted' | 'purchased';
  readonly transactionId: string;
  readonly confirmed: true;
} & (
  | { readonly originalPriceCents: number; readonly priceCents: number; readonly currency: 'EUR' }
  | { readonly originalPriceCents?: never; readonly priceCents?: never; readonly currency?: never }
);

export type MarketplaceNegotiationCommand =
  | {
      readonly kind: 'offer';
      readonly action: 'accept' | 'decline' | 'counter';
      readonly externalConversationId: string;
      readonly transactionId: string;
      readonly itemId: string;
      readonly buyerId: string;
      readonly offerId: string;
      readonly originalPriceCents: number;
      readonly offeredPriceCents: number;
      readonly priceCents: number | null;
      readonly currency: 'EUR';
    }
  | { readonly kind: 'message'; readonly externalConversationId: string; readonly text: string };

export interface MarketplaceNegotiationResult {
  readonly outcome: 'sent' | 'failed' | 'outcome_unknown' | 'skipped';
  readonly externalId?: string;
  readonly errorCode?: string;
}

export interface MarketplaceConfirmedNegotiationOffer {
  readonly command: Extract<MarketplaceNegotiationCommand, { kind: 'offer' }>;
  readonly externalId: string;
}

export interface MarketplaceNegotiationClaim {
  readonly jobId: string;
  readonly claimToken: string;
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly externalAccountId: string;
  readonly expiresAt: string;
  readonly command: MarketplaceNegotiationCommand;
  readonly sourceOffer: MarketplaceNegotiationOffer | null;
  readonly confirmedOffer: MarketplaceConfirmedNegotiationOffer | null;
}

export interface MarketplaceCloudNegotiationClaim extends MarketplaceNegotiationClaim {
  readonly userId: string;
  readonly workerId: string;
  readonly workerEpoch: number;
  readonly runnerId: string;
  readonly authorizationVersion: number;
  readonly sessionId: string;
  readonly absoluteExpiresAt: string;
}
