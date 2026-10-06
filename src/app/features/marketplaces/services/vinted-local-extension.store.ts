import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { environment } from '../../../../environments/environment';
import type { AccountScope, MarketplaceConnection } from '../models/marketplace.models';
import type {
  LocalExtensionApproval,
  LocalExtensionBinding,
} from '../../../../../supabase/functions/_shared/marketplace-local-extension-contracts';
import { parseLocalExtensionApproval } from '../../../../../supabase/functions/_shared/marketplace-local-extension-contracts';
import {
  parseLocalExtensionPreparedIdentity,
  parseLocalExtensionSyncResult,
  parseLocalExtensionInboxSyncResult,
  type LocalExtensionInboxSyncResult,
  type LocalExtensionPreparedIdentity,
  type LocalExtensionSyncResult,
} from '../../../../../supabase/functions/_shared/marketplace-local-extension-bridge-contracts';
import { MarketplaceResponseError } from '../models/marketplace-response';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { VintedLocalExtensionApiService } from './vinted-local-extension-api.service';
import { VintedLocalExtensionBridge } from './vinted-local-extension-bridge';

type LocalOperationResult =
  | { readonly status: 'success' }
  | { readonly status: 'failed'; readonly error: string }
  | { readonly status: 'cancelled' };

export type LocalInboxConversationReadResult =
  | { readonly status: 'success'; readonly observedAt: string }
  | Exclude<LocalOperationResult, { readonly status: 'success' }>;

@Injectable()
export class VintedLocalExtensionStore {
  private readonly api = inject(VintedLocalExtensionApiService);
  private readonly bridge = inject(VintedLocalExtensionBridge);
  private readonly accounts = inject(MarketplaceAccountStore);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  readonly connection = signal<MarketplaceConnection | null>(null);
  private readonly context = computed(() => {
    const connection = this.connection();
    const workspace = this.workspace.currentWorkspace();
    const user = this.auth.currentUser();
    return connection &&
      workspace &&
      !workspace.archived_at &&
      user &&
      this.accounts.canManage() &&
      connection.workspaceId === workspace.id
      ? JSON.stringify([user.id, workspace.id, connection.connectionId])
      : null;
  });
  private readonly loadedContext = signal<string | null>(null);
  private readonly state = signal<{
    busy: boolean;
    prepared: LocalExtensionPreparedIdentity | null;
    binding: LocalExtensionBinding | null;
    approval: LocalExtensionApproval | null;
    imported: LocalExtensionSyncResult | null;
    inboxImported: LocalExtensionInboxSyncResult | null;
    error: string | null;
    notice: string | null;
  }>({
    busy: false,
    prepared: null,
    binding: null,
    approval: null,
    imported: null,
    inboxImported: null,
    error: null,
    notice: null,
  });
  private revision = 0;
  private loadingBinding: Promise<void> = Promise.resolve();
  private operationFinished: Promise<void> = Promise.resolve();
  private destroyed = false;
  private readonly current = computed(
    () => this.context() !== null && this.context() === this.loadedContext(),
  );
  readonly busy = computed(() => this.current() && this.state().busy);
  readonly prepared = computed(() => (this.current() ? this.state().prepared : null));
  readonly binding = computed(() => (this.current() ? this.state().binding : null));
  readonly canRevoke = computed(
    () => this.current() && (this.state().binding !== null || this.state().approval !== null),
  );
  readonly imported = computed(() => (this.current() ? this.state().imported : null));
  readonly inboxImported = computed(() => (this.current() ? this.state().inboxImported : null));
  readonly messagesAllowed = computed(
    () => this.hasValidBinding() && this.binding()?.messagesRead === true,
  );
  readonly error = computed(() => (this.current() ? this.state().error : null));
  readonly notice = computed(() => (this.current() ? this.state().notice : null));
  constructor() {
    effect(() => {
      this.context();
      untracked(() => void this.loadBinding());
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.revision++;
      this.bridge.cancel();
    });
  }
  async loadConnection(connection: MarketplaceConnection): Promise<void> {
    if (this.destroyed) return;
    this.connection.set(connection);
    await this.loadBinding();
  }
  isCurrentConnection(connection: MarketplaceConnection): boolean {
    return (
      !this.destroyed &&
      this.current() &&
      this.connection()?.connectionId === connection.connectionId &&
      this.connection()?.workspaceId === connection.workspaceId
    );
  }
  hasValidBinding(): boolean {
    const binding = this.binding();
    const expectedId = this.connection()?.externalAccountId;
    return (
      !!binding &&
      !binding.revoked &&
      Date.parse(binding.expiresAt) > Date.now() &&
      (!expectedId || expectedId === binding.externalAccountId)
    );
  }
  canUseBrowserProfile(): boolean {
    const profile = this.bridge.localAccount();
    return (
      this.current() &&
      this.bridge.installed() &&
      !!profile &&
      profile.boundConnectionId === this.connection()?.connectionId &&
      profile.state === 'linked'
    );
  }
  showSetupNotice(): void {
    this.state.update((state) => ({
      ...state,
      notice:
        'Für dieses Konto fehlt eine gültige lokale Freigabe. Prüfe das angemeldete Vinted-Konto und verbinde es erneut.',
    }));
  }
  private loadBinding(): Promise<void> {
    const context = this.context();
    if (context === this.loadedContext()) return this.loadingBinding;
    this.revision++;
    this.bridge.cancel();
    this.loadedContext.set(context);
    this.state.set({
      busy: false,
      prepared: null,
      binding: null,
      approval: null,
      imported: null,
      inboxImported: null,
      error: null,
      notice: null,
    });
    this.loadingBinding = context
      ? this.run(async (scope) => ({ binding: await this.api.read(scope) })).then(() => undefined)
      : Promise.resolve();
    return this.loadingBinding;
  }
  async prepare(): Promise<void> {
    if (this.busy()) return;
    this.state.update((state) => ({ ...state, prepared: null }));
    await this.run(async () => {
      const prepared = parseLocalExtensionPreparedIdentity(
        await this.bridge.request('FLIPBASE_VINTED_LOCAL_PREPARE'),
      );
      if (!prepared) throw new MarketplaceResponseError();
      const expectedId = this.connection()?.externalAccountId;
      if (expectedId && expectedId !== prepared.identity.id)
        throw new Error(
          'In diesem Browserprofil ist ein anderes Vinted-Konto angemeldet. Öffne das Profil mit dem richtigen Konto.',
        );
      return { prepared, imported: null, notice: null };
    });
  }
  async approve(): Promise<void> {
    const prepared = this.prepared();
    if (!prepared) return;
    await this.run(async (scope, valid) => {
      const approval = await this.api.approve(scope, prepared.tokenHash, prepared.identity.id);
      if (!valid()) return {};
      this.state.update((state) => ({ ...state, approval }));
      await this.accounts.refreshLocalConnection(scope);
      if (!valid()) return {};
      const grantedBinding = await this.api.read(scope);
      if (!valid()) return {};
      if (
        !grantedBinding ||
        grantedBinding.revoked ||
        grantedBinding.externalAccountId !== prepared.identity.id
      )
        throw new MarketplaceResponseError();
      // Eine erteilte Serverfreigabe bleibt auch nach einem fehlgeschlagenen Browser-Bind widerrufbar.
      this.state.update((state) => ({ ...state, binding: grantedBinding }));
      const bound = parseLocalExtensionApproval(
        await this.bridge.request('FLIPBASE_VINTED_LOCAL_BIND', {
          ...approval,
          tokenHash: prepared.tokenHash,
          apiUrl: `${environment.supabaseUrl}/functions/v1/marketplace-local-extension`,
        }),
        scope,
      );
      if (
        !bound ||
        bound.externalAccountId !== prepared.identity.id ||
        Date.parse(bound.expiresAt) !== Date.parse(approval.expiresAt)
      )
        throw new MarketplaceResponseError();
      if (!valid()) return {};
      const binding = await this.api.read(scope);
      if (!binding || binding.revoked || binding.externalAccountId !== prepared.identity.id)
        throw new MarketplaceResponseError();
      return {
        binding,
        prepared: null,
        notice:
          'Freigabe erteilt. Übernimm jetzt Profil und Inserate, um die Verbindung zu bestätigen.',
      };
    });
  }
  async sync(): Promise<void> {
    const binding = this.binding();
    if (!binding || !this.hasValidBinding()) {
      this.showSetupNotice();
      return;
    }
    await this.run(async (scope, valid) => {
      this.assertMatchingBrowserBinding(scope);
      const imported = parseLocalExtensionSyncResult(
        await this.bridge.request('FLIPBASE_VINTED_LOCAL_SYNC', scope),
        scope,
        binding.externalAccountId,
      );
      if (!imported) throw new MarketplaceResponseError();
      if (!valid()) return {};
      const connection = await this.accounts.refreshLocalConnection(scope);
      if (!valid()) return {};
      if (
        connection?.executionMode !== 'local' ||
        connection.status !== 'connected' ||
        connection.externalAccountId !== binding.externalAccountId ||
        !connection.lastSyncedAt ||
        Date.parse(connection.lastSyncedAt) !== Date.parse(imported.observedAt)
      )
        throw new Error(
          'Die Datenübernahme ist noch nicht serverseitig bestätigt. Lade den Verbindungsstatus erneut.',
        );
      const currentBinding = await this.api.read(scope);
      if (
        !currentBinding ||
        currentBinding.revoked ||
        currentBinding.externalAccountId !== binding.externalAccountId
      )
        throw new MarketplaceResponseError();
      return {
        imported,
        binding: currentBinding,
        notice: 'Profil und Inserate wurden übernommen und die lokale Verbindung bestätigt.',
      };
    });
  }
  async approveInbox(): Promise<void> {
    const binding = this.binding();
    if (!binding || !this.hasValidBinding()) {
      this.showSetupNotice();
      return;
    }
    await this.run(async (scope, valid) => {
      this.assertMatchingBrowserBinding(scope);
      const prepared = parseLocalExtensionPreparedIdentity(
        await this.bridge.request('FLIPBASE_VINTED_LOCAL_PREPARE'),
      );
      if (!valid()) return {};
      if (!prepared) throw new MarketplaceResponseError();
      if (prepared.identity.id !== binding.externalAccountId)
        throw new Error(
          'In diesem Browserprofil ist ein anderes Vinted-Konto angemeldet. Öffne das Profil mit dem richtigen Konto.',
        );
      const approval = await this.api.approveInbox(scope, prepared.tokenHash, prepared.identity.id);
      if (!valid()) return {};
      if (Date.parse(approval.expiresAt) !== Date.parse(binding.expiresAt))
        throw new MarketplaceResponseError();
      const currentBinding = await this.api.read(scope);
      if (
        !currentBinding ||
        currentBinding.revoked ||
        !currentBinding.messagesRead ||
        currentBinding.externalAccountId !== binding.externalAccountId ||
        Date.parse(currentBinding.expiresAt) !== Date.parse(binding.expiresAt)
      )
        throw new MarketplaceResponseError();
      return {
        binding: currentBinding,
        notice: 'Nachrichtenzugriff erlaubt. Du kannst Dein Postfach jetzt synchronisieren.',
      };
    });
  }
  async syncInbox(): Promise<void> {
    const binding = this.binding();
    if (!binding || !this.hasValidBinding()) {
      this.showSetupNotice();
      return;
    }
    if (!this.messagesAllowed()) {
      this.state.update((state) => ({
        ...state,
        notice: 'Erlaube zuerst den Nachrichtenzugriff für dieses Browserprofil.',
      }));
      return;
    }
    await this.run(async (scope, valid) => {
      this.assertMatchingBrowserBinding(scope);
      const inboxImported = parseLocalExtensionInboxSyncResult(
        await this.bridge.request('FLIPBASE_VINTED_LOCAL_INBOX_SYNC', scope),
        scope,
        binding.externalAccountId,
      );
      if (!inboxImported || Date.parse(inboxImported.expiresAt) !== Date.parse(binding.expiresAt))
        throw new MarketplaceResponseError();
      if (!valid()) return {};
      const connection = await this.accounts.refreshLocalConnection(scope, true);
      if (!valid()) return {};
      if (
        connection?.executionMode !== 'local' ||
        connection.status !== 'connected' ||
        connection.externalAccountId !== binding.externalAccountId ||
        !connection.lastSyncedAt ||
        Date.parse(connection.lastSyncedAt) < Date.parse(inboxImported.observedAt) ||
        connection.capabilities['conversations.read'] !== 'verified'
      )
        throw new Error(
          'Der Postfachabgleich ist noch nicht serverseitig bestätigt. Lade den Verbindungsstatus erneut.',
        );
      const currentBinding = await this.api.read(scope);
      if (
        !currentBinding ||
        currentBinding.revoked ||
        !currentBinding.messagesRead ||
        currentBinding.externalAccountId !== binding.externalAccountId
      )
        throw new MarketplaceResponseError();
      return {
        inboxImported,
        binding: currentBinding,
        notice: `${inboxImported.counts.conversation} ${inboxImported.counts.conversation === 1 ? 'Gespräch' : 'Gespräche'} und ${inboxImported.counts.message} ${inboxImported.counts.message === 1 ? 'Nachricht' : 'Nachrichten'} übernommen. Verläufe bleiben ein Teilstand; ungelesene Gespräche wurden nicht geöffnet.${inboxImported.nextPage > 1 ? ' Weitere Gespräche kannst Du mit dem nächsten Abgleich übernehmen.' : ''}`,
      };
    });
  }
  async revoke(): Promise<void> {
    await this.run(async (scope, valid) => {
      await this.api.revoke(scope);
      if (!valid()) return {};
      // Der serverseitige Widerruf gilt auch bei geschlossener oder fehlender Erweiterung.
      void this.bridge.request('FLIPBASE_VINTED_LOCAL_DISCONNECT', scope).catch(() => undefined);
      await this.accounts.refreshLocalConnection(scope);
      return {
        binding: null,
        approval: null,
        prepared: null,
        imported: null,
        inboxImported: null,
        notice: 'Die lokale Freigabe wurde widerrufen. Die gespeicherten Daten bleiben erhalten.',
      };
    });
  }
  async approveSend(): Promise<boolean> {
    const binding = this.binding();
    if (!binding || !this.hasValidBinding() || !this.messagesAllowed() || this.busy()) return false;
    await this.run(async (scope, valid) => {
      this.assertMatchingBrowserBinding(scope);
      const prepared = parseLocalExtensionPreparedIdentity(
        await this.bridge.request('FLIPBASE_VINTED_LOCAL_PREPARE'),
      );
      if (!valid()) return {};
      if (!prepared || prepared.identity.id !== binding.externalAccountId)
        throw new Error('Prüfe das angemeldete Vinted-Konto in diesem Browserprofil.');
      const approval = await this.api.approveMessaging(
        scope,
        prepared.tokenHash,
        prepared.identity.id,
      );
      if (!valid()) return {};
      if (Date.parse(approval.expiresAt) !== Date.parse(binding.expiresAt))
        throw new MarketplaceResponseError();
      const currentBinding = await this.api.read(scope);
      if (
        !currentBinding ||
        currentBinding.revoked ||
        !currentBinding.messagesSend ||
        currentBinding.externalAccountId !== binding.externalAccountId ||
        Date.parse(currentBinding.expiresAt) !== Date.parse(binding.expiresAt)
      )
        throw new MarketplaceResponseError();
      return { binding: currentBinding };
    });
    return this.hasValidBinding() && this.binding()?.messagesSend === true && !this.error();
  }
  async openInboxConversation(
    conversationId: string,
    isCurrent: () => boolean = () => true,
  ): Promise<LocalInboxConversationReadResult> {
    const context = this.context();
    while (this.busy()) {
      await this.operationFinished;
      if (this.destroyed || context !== this.context() || !isCurrent())
        return { status: 'cancelled' };
    }
    const binding = this.binding();
    if (
      !context ||
      context !== this.context() ||
      !isCurrent() ||
      !binding ||
      !this.messagesAllowed() ||
      !/^[0-9a-f-]{36}$/i.test(conversationId)
    )
      return { status: 'cancelled' };
    let observedAt: string | null = null;
    const result = await this.run(async (scope, valid) => {
      this.assertMatchingBrowserBinding(scope);
      if (!valid() || !isCurrent()) return {};
      const inboxImported = parseLocalExtensionInboxSyncResult(
        await this.bridge.request('FLIPBASE_VINTED_LOCAL_INBOX_DETAIL', {
          ...scope,
          conversationId,
        }),
        scope,
        binding.externalAccountId,
      );
      if (!valid() || !isCurrent()) return {};
      if (!inboxImported || Date.parse(inboxImported.expiresAt) !== Date.parse(binding.expiresAt))
        throw new MarketplaceResponseError();
      await this.accounts.refreshLocalConnection(scope, true);
      if (!valid() || !isCurrent()) return {};
      const currentBinding = await this.api.read(scope);
      if (!valid() || !isCurrent()) return {};
      if (
        !currentBinding ||
        currentBinding.revoked ||
        currentBinding.externalAccountId !== binding.externalAccountId
      )
        throw new MarketplaceResponseError();
      observedAt = inboxImported.observedAt;
      return { inboxImported, binding: currentBinding };
    });
    return result.status === 'success'
      ? observedAt
        ? { status: 'success', observedAt }
        : { status: 'cancelled' }
      : result;
  }
  private assertMatchingBrowserBinding(scope: AccountScope): void {
    const profile = this.bridge.localAccount();
    if (profile && profile.boundConnectionId !== scope.connectionId)
      throw new Error(
        'Dieses Konto ist in einem anderen Browserprofil verknüpft. Öffne das passende Profil.',
      );
    if (!this.canUseBrowserProfile())
      throw new Error(
        'Dieses Browserprofil ist derzeit nicht für Live-Abrufe bereit. Prüfe die Verbindung in der Kontoverwaltung.',
      );
  }
  async refreshStatus(): Promise<void> {
    if (this.busy() || !this.hasValidBinding()) return;
    await this.run(async (scope) => ({ binding: await this.api.read(scope) }));
  }
  private async run(
    operation: (
      scope: AccountScope,
      valid: () => boolean,
    ) => Promise<Partial<ReturnType<typeof this.state>>>,
  ): Promise<LocalOperationResult> {
    const context = this.context();
    const connection = this.connection();
    if (this.destroyed || !context || !this.current() || !connection || this.busy())
      return { status: 'cancelled' };
    let finishOperation: (() => void) | undefined;
    this.operationFinished = new Promise<void>((resolve) => {
      finishOperation = resolve;
    });
    const revision = ++this.revision;
    const valid = () => !this.destroyed && revision === this.revision && context === this.context();
    this.state.update((state) => ({ ...state, busy: true, error: null }));
    try {
      const update = await operation(
        { workspaceId: connection.workspaceId, connectionId: connection.connectionId },
        valid,
      );
      if (!valid()) return { status: 'cancelled' };
      this.state.update((state) => ({ ...state, ...update }));
      return { status: 'success' };
    } catch (error) {
      if (valid()) {
        const message =
          error instanceof Error
            ? error.message
            : 'Die lokale Verbindung konnte nicht bestätigt werden.';
        this.state.update((state) => ({
          ...state,
          error: message,
        }));
        return { status: 'failed', error: message };
      }
      return { status: 'cancelled' };
    } finally {
      if (valid()) this.state.update((state) => ({ ...state, busy: false }));
      finishOperation?.();
    }
  }
}
