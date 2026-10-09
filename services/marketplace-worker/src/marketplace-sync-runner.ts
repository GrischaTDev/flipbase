import { randomUUID } from 'node:crypto';
import type { BrowserInfo } from './gologin-cloud-browser.ts';
import {
  MarketplaceBrowserSessionEndedError,
  type BrowserSessionScope,
} from './marketplace-browser-session-broker.ts';
import {
  VintedImportReadError,
  VintedImportRequestError,
  type VintedAccountImport,
  type VintedConversationVersion,
  type VintedImportStage,
} from './vinted-account-import.ts';
import type {
  MarketplaceSyncError,
  MarketplaceSyncOperation,
  MarketplaceSyncStage,
  SupabaseMarketplaceOperationStore,
} from './supabase-marketplace-operation-store.ts';
import { MarketplaceOperationEvents } from './marketplace-operation-events.ts';

interface SyncBroker {
  open(scope: BrowserSessionScope): Promise<string>;
  run<T>(
    scope: BrowserSessionScope,
    id: string,
    operation: (browser: BrowserInfo) => Promise<T>,
  ): Promise<T>;
  close(scope: BrowserSessionScope, id: string): Promise<void>;
}

interface ImportWriter {
  favoriteSettingsActive?(scope: BrowserSessionScope, sessionId: string): Promise<boolean>;
  conversationVersions?(
    scope: BrowserSessionScope,
    sessionId: string,
  ): Promise<VintedConversationVersion[]>;
  write(
    scope: BrowserSessionScope,
    sessionId: string,
    snapshot: VintedAccountImport,
  ): Promise<Record<'profile' | 'publication' | 'conversation' | 'message' | 'sale', number>>;
}

export class MarketplaceSyncRunner {
  private readonly broker: SyncBroker;
  private readonly imports: ImportWriter;
  private readonly operations: SupabaseMarketplaceOperationStore;
  private readonly events: MarketplaceOperationEvents;
  private readonly dispatch?: () => void;

  constructor(
    broker: SyncBroker,
    imports: ImportWriter,
    operations: SupabaseMarketplaceOperationStore,
    events: MarketplaceOperationEvents = new MarketplaceOperationEvents(),
    dispatch?: () => void,
  ) {
    this.broker = broker;
    this.imports = imports;
    this.operations = operations;
    this.events = events;
    this.dispatch = dispatch;
  }

  async start(scope: BrowserSessionScope): Promise<string> {
    if (scope.messageWrite || scope.favoriteWrite || scope.negotiationWrite)
      throw new Error('Leseauftrag ungültig');
    const operation = await this.operations.enqueue(scope);
    if (this.dispatch) {
      this.dispatch();
      return operation.id;
    }
    if (operation.requestedBy === scope.userId) {
      void this.execute({ ...scope }, operation.id).catch(() => undefined);
    }
    return operation.id;
  }

  read(scope: BrowserSessionScope, id: string): Promise<MarketplaceSyncOperation | null> {
    return this.operations.read(scope, id);
  }

  runDispatched(scope: BrowserSessionScope): Promise<void> {
    if (scope.messageWrite || scope.favoriteWrite || scope.negotiationWrite || !scope.syncRead)
      return Promise.reject(new Error('Leseauftrag fehlt'));
    return this.execute(scope, scope.syncRead.operationId);
  }

  private async execute(scope: BrowserSessionScope, id: string): Promise<void> {
    const runnerId = scope.syncRead?.runnerId ?? randomUUID();
    if (!(await this.operations.claim(scope, id, runnerId))) {
      if (scope.syncRead) throw new Error('Reservierter Leseauftrag kann nicht bestätigt werden');
      return;
    }
    let sessionId: string | undefined;
    let failedStage: MarketplaceSyncError = 'browser';
    let requestFailure: VintedImportRequestError['reason'] | undefined;
    let retryAfter: string | undefined;
    let browserReadFailures: VintedAccountImport['browserReadFailures'];
    let favoriteReadFailure: VintedImportRequestError | undefined;
    let sessionClosed = false;
    let currentStage: MarketplaceSyncStage = 'browser';
    let stageStartedAt = Date.now();
    const moveTo = async (nextStage: MarketplaceSyncStage): Promise<void> => {
      await this.operations.stage(scope, id, runnerId, nextStage);
      this.events.record({
        operationId: id,
        stage: currentStage,
        outcome: 'completed',
        elapsedMs: Date.now() - stageStartedAt,
      });
      currentStage = nextStage;
      stageStartedAt = Date.now();
    };
    try {
      sessionId = await this.broker.open(scope);
      const currentSessionId = sessionId;
      failedStage = 'access';
      const previousConversations =
        (await this.imports.conversationVersions?.(scope, currentSessionId)) ?? [];
      const snapshot = await this.broker.run(scope, currentSessionId, async (browser) => {
        if (!browser.importAccount) throw new Error('Vinted-Import fehlt');
        try {
          return await browser.importAccount(
            () => this.broker.run(scope, currentSessionId, async () => undefined),
            async (stage) => {
              failedStage = stage;
              await moveTo(stage);
            },
            previousConversations,
          );
        } catch (error) {
          if (error instanceof MarketplaceBrowserSessionEndedError) throw error;
          if (error instanceof VintedImportReadError) {
            failedStage =
              error.cause instanceof MarketplaceBrowserSessionEndedError
                ? 'access'
                : this.importErrorCode(error.stage);
            if (error.cause instanceof VintedImportRequestError) {
              requestFailure = error.cause.reason;
              retryAfter = error.cause.retryAfter;
              browserReadFailures = error.cause.browserReadFailure
                ? [error.cause.browserReadFailure]
                : undefined;
              if (requestFailure === 'unauthorized') failedStage = 'identity';
            }
          }
          return null;
        }
      });
      if (!snapshot) throw new Error('Vinted-Datenabruf fehlgeschlagen');
      if (await this.imports.favoriteSettingsActive?.(scope, currentSessionId)) {
        const favoriteRead = await this.broker.run(scope, currentSessionId, async (browser) => {
          try {
            if (!browser.readFavoriteEvents) throw new VintedImportRequestError('invalid_response');
            return {
              events: await browser.readFavoriteEvents(snapshot.identity.id, () =>
                this.broker.run(scope, currentSessionId, async () => undefined),
              ),
            };
          } catch (error) {
            if (error instanceof MarketplaceBrowserSessionEndedError) throw error;
            return {
              failure:
                error instanceof VintedImportRequestError
                  ? error
                  : new VintedImportRequestError('provider_unavailable'),
            };
          }
        });
        if (favoriteRead.failure) favoriteReadFailure = favoriteRead.failure;
        else snapshot.favoriteEvents = favoriteRead.events;
      }
      failedStage = 'access';
      await this.broker.run(scope, currentSessionId, async () => undefined);
      failedStage = 'persist';
      await moveTo('persist');
      const counts = await this.imports.write(scope, currentSessionId, snapshot);
      failedStage = 'cleanup';
      await moveTo('cleanup');
      let cleanupPending = false;
      try {
        await this.broker.close(scope, currentSessionId);
        sessionClosed = true;
      } catch {
        cleanupPending = true;
      }
      sessionId = undefined;
      if (favoriteReadFailure) {
        failedStage = cleanupPending
          ? 'cleanup'
          : favoriteReadFailure.reason === 'unauthorized'
            ? 'identity'
            : 'access';
        requestFailure = favoriteReadFailure.reason;
        retryAfter = favoriteReadFailure.retryAfter;
        throw favoriteReadFailure;
      }
      await this.operations.succeed(
        scope,
        id,
        runnerId,
        snapshot.observedAt,
        counts,
        cleanupPending,
        snapshot.areas,
      );
      this.events.record({
        operationId: id,
        stage: currentStage,
        outcome: 'completed',
        elapsedMs: Date.now() - stageStartedAt,
        sourceRequestCount: snapshot.sourceRequestCount,
        browserReadFailures: snapshot.browserReadFailures,
      });
    } catch (error) {
      if (error instanceof MarketplaceBrowserSessionEndedError)
        failedStage = error.reason === 'expired' ? 'access' : 'interrupted';
      if (sessionId) {
        try {
          await this.broker.close(scope, sessionId);
          sessionClosed = true;
        } catch {
          failedStage = 'cleanup';
        }
      }
      this.events.record({
        operationId: id,
        stage: currentStage,
        outcome: 'failed',
        elapsedMs: Date.now() - stageStartedAt,
        errorCode: failedStage,
        requestFailure,
        browserReadFailures,
      });
      try {
        await this.operations.fail(scope, id, runnerId, failedStage, requestFailure, retryAfter);
      } catch {
        // Beim nächsten Start wird der ungeklärte Auftrag als unterbrochen markiert.
        if (scope.syncRead) {
          // Anbieterantworten dürfen nicht in die öffentliche Fehlerkette gelangen.
          throw new Error('Reservierter Leseauftrag verlangt Wiederherstellung');
        }
      }
      if (scope.syncRead && !sessionId && !sessionClosed) {
        // eslint-disable-next-line preserve-caught-error
        throw new Error('Reservierte Browsersitzung verlangt Wiederherstellung');
      }
    }
  }

  private importErrorCode(stage: VintedImportStage): MarketplaceSyncError {
    return stage === 'navigation' ? 'browser' : stage;
  }
}
