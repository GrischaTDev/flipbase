import type {
  MarketplaceSyncError,
  MarketplaceSyncStage,
} from './supabase-marketplace-operation-store.ts';

export interface MarketplaceOperationEvent {
  operationId: string;
  stage: MarketplaceSyncStage;
  outcome: 'completed' | 'failed';
  elapsedMs: number;
  errorCode?: MarketplaceSyncError;
}

/** Ausschließlich feste Metadaten, niemals Anbieterantworten oder Anmeldedaten. */
export class MarketplaceOperationEvents {
  record(event: MarketplaceOperationEvent): void {
    const line = `${JSON.stringify({
      event: 'marketplace_sync_stage',
      operationId: event.operationId,
      stage: event.stage,
      outcome: event.outcome,
      elapsedMs: Math.max(0, Math.round(event.elapsedMs)),
      ...(event.errorCode ? { errorCode: event.errorCode } : {}),
    })}\n`;
    try {
      process.stdout.write(line);
    } catch {
      // Eine defekte Logausgabe verändert keinen bereits bestätigten Auftrag.
    }
  }
}
