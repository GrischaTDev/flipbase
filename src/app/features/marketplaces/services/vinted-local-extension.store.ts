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
  type LocalExtensionPreparedIdentity,
  type LocalExtensionSyncResult,
} from '../../../../../supabase/functions/_shared/marketplace-local-extension-bridge-contracts';
import { MarketplaceResponseError } from '../models/marketplace-response';
import { MarketplaceAccountStore } from './marketplace-account.store';
import { VintedLocalExtensionApiService } from './vinted-local-extension-api.service';
import { VintedLocalExtensionBridge } from './vinted-local-extension-bridge';

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
    error: string | null;
    notice: string | null;
  }>({
    busy: false,
    prepared: null,
    binding: null,
    approval: null,
    imported: null,
    error: null,
    notice: null,
  });
  private revision = 0;
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
  readonly error = computed(() => (this.current() ? this.state().error : null));
  readonly notice = computed(() => (this.current() ? this.state().notice : null));
  constructor() {
    effect(() => {
      const context = this.context();
      untracked(() => {
        this.revision++;
        this.bridge.cancel();
        this.loadedContext.set(context);
        this.state.set({
          busy: false,
          prepared: null,
          binding: null,
          approval: null,
          imported: null,
          error: null,
          notice: null,
        });
        if (context)
          void this.run(async (scope) => {
            const binding = await this.api.read(scope);
            return { binding };
          });
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.revision++;
      this.bridge.cancel();
    });
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
    if (!binding || binding.revoked) return;
    await this.run(async (scope, valid) => {
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
        notice: 'Die lokale Freigabe wurde widerrufen. Die gespeicherten Daten bleiben erhalten.',
      };
    });
  }
  private async run(
    operation: (
      scope: AccountScope,
      valid: () => boolean,
    ) => Promise<Partial<ReturnType<typeof this.state>>>,
  ): Promise<void> {
    const context = this.context();
    const connection = this.connection();
    if (!context || !this.current() || !connection || this.busy()) return;
    const revision = ++this.revision;
    const valid = () => !this.destroyed && revision === this.revision && context === this.context();
    this.state.update((state) => ({ ...state, busy: true, error: null }));
    try {
      const update = await operation(
        { workspaceId: connection.workspaceId, connectionId: connection.connectionId },
        valid,
      );
      if (valid()) this.state.update((state) => ({ ...state, ...update }));
    } catch (error) {
      if (valid())
        this.state.update((state) => ({
          ...state,
          error:
            error instanceof Error
              ? error.message
              : 'Die lokale Verbindung konnte nicht bestätigt werden.',
        }));
    } finally {
      if (valid()) this.state.update((state) => ({ ...state, busy: false }));
    }
  }
}
