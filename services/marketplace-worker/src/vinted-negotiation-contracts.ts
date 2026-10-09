import '../../../tools/flipbase-extension/vinted-negotiation-runtime.js';
import type {
  MarketplaceNegotiationCommand,
  MarketplaceNegotiationOffer,
  MarketplaceNegotiationResult,
  MarketplaceNegotiationEvent,
  MarketplaceConfirmedNegotiationOffer,
} from '../../../supabase/functions/_shared/marketplace-negotiation-contracts.d.ts';

export type ConfirmedNegotiationOffer = MarketplaceConfirmedNegotiationOffer;
export interface NegotiationProviderAdapter {
  read(path: string): Promise<unknown>;
  write(path: string, method: 'PUT' | 'POST', body?: Record<string, unknown>): Promise<unknown>;
  authorize(): Promise<void>;
  sendMessage(
    command: Extract<MarketplaceNegotiationCommand, { kind: 'message' }>,
    authorize: () => Promise<void>,
  ): Promise<MarketplaceNegotiationResult>;
}
interface NegotiationRuntime {
  record(input: unknown): Record<string, unknown>;
  id(input: unknown): string | null;
  cents(input: unknown): number | null;
  providerTime(input: unknown, observedAt: string): string | null;
  isCommand(input: unknown): input is MarketplaceNegotiationCommand;
  isOffer(input: unknown): input is MarketplaceNegotiationOffer;
  isResult(input: unknown): input is MarketplaceNegotiationResult;
  isEvent(input: unknown): input is MarketplaceNegotiationEvent;
  isConfirmedOffer(input: unknown): input is ConfirmedNegotiationOffer;
  readOffer(
    message: unknown,
    conversation: unknown,
    accountId: string,
  ): MarketplaceNegotiationOffer | null;
  readPurchase(
    transaction: unknown,
    conversation: unknown,
    accountId: string,
    observedAt: string,
  ): { event: MarketplaceNegotiationEvent; occurredAt: string } | null;
  execute(
    adapter: NegotiationProviderAdapter,
    accountId: string,
    command: MarketplaceNegotiationCommand,
    sourceOffer: MarketplaceNegotiationOffer | null,
    confirmedOffer: ConfirmedNegotiationOffer | null,
  ): Promise<MarketplaceNegotiationResult>;
}
const runtime = (globalThis as unknown as { FlipbaseVintedNegotiationRuntime: NegotiationRuntime })
  .FlipbaseVintedNegotiationRuntime;
export const negotiationRecord = runtime.record;
export const negotiationId = runtime.id;
export const negotiationCents = runtime.cents;
export const negotiationProviderTime = runtime.providerTime;
export const isVintedNegotiationCommand = runtime.isCommand;
export const isVintedNegotiationOffer = runtime.isOffer;
export const isVintedNegotiationResult = runtime.isResult;
export const isVintedNegotiationEvent = runtime.isEvent;
export const isConfirmedNegotiationOffer = runtime.isConfirmedOffer;
export const readVintedNegotiationOffer = runtime.readOffer;
export const readVintedNegotiationPurchase = runtime.readPurchase;
export const executeVintedNegotiation = runtime.execute;
