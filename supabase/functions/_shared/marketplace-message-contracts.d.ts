export interface MarketplaceMessageAttachment {
  readonly name: string;
  readonly mimeType: 'image/jpeg' | 'image/png';
  readonly base64: string;
}

export interface MarketplaceMessageCommand {
  readonly externalConversationId: string;
  readonly text: string;
  readonly attachment: MarketplaceMessageAttachment | null;
}

export interface MarketplaceMessageResult {
  readonly outcome: 'sent' | 'failed' | 'outcome_unknown';
  readonly externalMessageId?: string;
  readonly errorCode?: string;
}
export interface MarketplaceFavoriteMessageCommand {
  readonly recipientId: string;
  readonly itemId: string;
  readonly text: string;
}
export type MarketplaceFavoriteMessageResult =
  | (MarketplaceMessageResult & {
      readonly conversationId?: string;
      readonly transactionId?: string;
    })
  | { readonly outcome: 'skipped'; readonly errorCode: string };
export interface MarketplaceFavoriteOfferCommand extends MarketplaceFavoriteMessageCommand {
  readonly conversationId: string;
  readonly transactionId: string;
  readonly externalMessageId: string;
  readonly offer: { readonly type: 'amount' | 'percentage'; readonly value: number };
}
export interface MarketplaceFavoriteOfferResult {
  readonly outcome: 'sent' | 'failed' | 'outcome_unknown' | 'skipped';
  readonly externalOfferId?: string;
  readonly errorCode?: string;
}
