export interface MarketplaceInboxEvent {
  readonly externalId: string;
  readonly externalConversationId: string;
  readonly occurredAt: string;
  readonly direction: 'inbound';
  readonly source: 'conversation_snapshot';
}

export interface MarketplaceInboxEventBatch {
  readonly observedAt: string;
  readonly events: readonly MarketplaceInboxEvent[];
  readonly complete: boolean;
  readonly coveredConversationIds: readonly string[];
}
