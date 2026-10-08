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
