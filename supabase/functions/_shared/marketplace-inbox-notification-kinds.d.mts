import type { MarketplaceInboxNotificationKind } from './marketplace-inbox-event-contracts.d.ts';

export const marketplaceInboxEventMaxBytes: number;

export function isMarketplaceInboxNotificationKind(
  input: unknown,
  externalId: string,
): input is MarketplaceInboxNotificationKind;
