import type { AccountScope } from './marketplace-contracts.ts';

export type EbayConversationType = 'FROM_MEMBERS' | 'FROM_EBAY';
export interface EbayMessage {
  readonly id: string;
  readonly createdAt: string;
  readonly text: string;
  readonly sender: string;
  readonly recipient: string;
  readonly attachments: readonly { readonly name: string; readonly url: string }[];
}
export interface EbayConversation {
  readonly id: string;
  readonly type: EbayConversationType;
  readonly title: string;
  readonly unreadCount: number;
  readonly listingId: string | null;
  readonly latestMessage: EbayMessage | null;
}
export interface EbayInbox extends AccountScope {
  readonly conversations: readonly EbayConversation[];
  readonly total: number;
  readonly nextOffset: number | null;
}
export interface EbayConversationMessages extends AccountScope {
  readonly conversationId: string;
  readonly type: EbayConversationType;
  readonly title: string;
  readonly messages: readonly EbayMessage[];
  readonly total: number;
  readonly nextOffset: number | null;
}
