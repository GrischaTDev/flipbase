import type {
  AccountScope,
  MarketplaceConnection,
  MarketplaceMetrics,
} from '../models/marketplace.models';

/** Ausschließlich künstliche Testdaten. Niemals als produktive Konten oder Freigaben laden. */
export function createMarketplaceFixtures(): {
  connections: MarketplaceConnection[];
  publications: (AccountScope & { id: string; metrics: MarketplaceMetrics })[];
  conversations: (AccountScope & { id: string; title: string })[];
} {
  return {
    connections: [
      {
        workspaceId: 'fixture-workspace',
        connectionId: 'fixture-account-a',
        marketplace: 'vinted',
        displayName: 'Testkonto A',
        externalAccountId: 'fixture-vinted-a',
        status: 'connected',
        capabilities: { 'profile.read': 'verified', 'messages.sendText': 'verified' },
        allowedActions: ['profile.read', 'messages.sendText'],
        lastSyncedAt: null,
      },
      {
        workspaceId: 'fixture-workspace',
        connectionId: 'fixture-account-b',
        marketplace: 'vinted',
        displayName: 'Testkonto B',
        externalAccountId: 'fixture-vinted-b',
        status: 'connected',
        capabilities: { 'profile.read': 'verified', 'messages.sendText': 'unknown' },
        allowedActions: ['profile.read'],
        lastSyncedAt: null,
      },
    ],
    publications: [
      {
        workspaceId: 'fixture-workspace',
        connectionId: 'fixture-account-a',
        id: 'fixture-publication-a',
        metrics: { views: 0, favorites: 0, observedAt: '2026-09-26T00:00:00Z' },
      },
      {
        workspaceId: 'fixture-workspace',
        connectionId: 'fixture-account-b',
        id: 'fixture-publication-b',
        metrics: { views: null, favorites: null, observedAt: null },
      },
    ],
    conversations: [
      {
        workspaceId: 'fixture-workspace',
        connectionId: 'fixture-account-a',
        id: 'fixture-conversation-a',
        title: 'Gespräch A',
      },
      {
        workspaceId: 'fixture-workspace',
        connectionId: 'fixture-account-b',
        id: 'fixture-conversation-b',
        title: 'Gespräch B',
      },
    ],
  };
}
