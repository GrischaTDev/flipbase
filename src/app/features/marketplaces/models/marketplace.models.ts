// Nur Typen wiederverwenden: keine Server-Laufzeit und keine Browsergeheimnisse importieren.
export type {
  AccountScope,
  Capability,
  CapabilityMap,
  CapabilityState,
  CommandPayloads,
  CommandRequest,
  CommandStatus,
  ConnectionStatus,
  Marketplace,
  MarketplaceConnection,
  MarketplaceMetrics,
  PageRequest,
} from '../../../../../supabase/functions/_shared/marketplace-contracts';
