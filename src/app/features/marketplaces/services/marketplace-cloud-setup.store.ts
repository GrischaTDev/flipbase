import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { CloudSetupRequest, CloudSetupView } from '../models/marketplace-cloud-setup';
import { MarketplaceAccountStore } from './marketplace-account.store';
import {
  CLOUD_CAPACITY_MESSAGE,
  CLOUD_CHECK_MESSAGE,
  CLOUD_PURCHASE_PENDING_MESSAGE,
  CLOUD_PURCHASE_FAILED_MESSAGE,
  CLOUD_IP_LIMIT_MESSAGE,
  CLOUD_PRICE_LIMIT_MESSAGE,
  CLOUD_SWITCH_BLOCKED_MESSAGE,
  MarketplaceCloudSetupApiService,
} from './marketplace-cloud-setup-api.service';

@Injectable()
export class MarketplaceCloudSetupStore {
  private readonly api = inject(MarketplaceCloudSetupApiService);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly accounts = inject(MarketplaceAccountStore);
  private readonly context = computed(() =>
    JSON.stringify([this.auth.currentUser()?.id, this.workspace.currentWorkspace()?.id]),
  );
  private readonly availability = signal<{ context: string; allowed: boolean } | null>(null);
  private readonly active = signal<{
    context: string;
    setup: CloudSetupView;
    token: string;
  } | null>(null);
  private readonly busyContext = signal<string | null>(null);
  private readonly errorState = signal<{ context: string; message: string } | null>(null);
  private pendingRequest: { context: string; payload: CloudSetupRequest } | null = null;
  private revision = 0;
  private destroyed = false;
  readonly canSetup = computed(
    () =>
      this.accounts.canManage() &&
      this.availability()?.context === this.context() &&
      this.availability()?.allowed === true,
  );
  readonly setup = computed(() =>
    this.active()?.context === this.context() && this.busyContext() !== this.context()
      ? (this.active()?.setup ?? null)
      : null,
  );
  readonly busy = computed(() => this.busyContext() === this.context());
  readonly error = computed(() =>
    this.errorState()?.context === this.context() ? (this.errorState()?.message ?? null) : null,
  );

  constructor() {
    effect(() => {
      const context = this.context();
      const workspace = this.workspace.currentWorkspace();
      const token = this.auth.session()?.access_token;
      if (workspace && !workspace.archived_at && token && this.accounts.canManage())
        void this.checkAvailability(context, workspace.id, token);
      else this.availability.set(null);
      const active = this.active();
      if (
        active &&
        (active.context !== context ||
          (!this.accounts.loading() && !this.accounts.canManage()) ||
          workspace?.archived_at ||
          !token)
      ) {
        this.active.set(null);
        void this.api.action(active.setup, 'cancel', active.token).catch(() => undefined);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.revision++;
      void this.cancel();
    });
  }

  async begin(
    target: { connectionId: string } | { displayName: string },
  ): Promise<CloudSetupView | null> {
    const context = this.context();
    const workspace = this.workspace.currentWorkspace();
    const token = this.auth.session()?.access_token;
    if (!this.canSetup() || this.busy() || !workspace || workspace.archived_at || !token)
      return null;
    const revision = ++this.revision;
    const pending = this.pendingRequest;
    const matches =
      pending?.context === context &&
      ('connectionId' in target
        ? 'connectionId' in pending.payload && pending.payload.connectionId === target.connectionId
        : 'displayName' in pending.payload && pending.payload.displayName === target.displayName);
    const request: CloudSetupRequest =
      matches && pending
        ? pending.payload
        : { workspaceId: workspace.id, ...target, requestId: crypto.randomUUID() };
    this.pendingRequest = { context, payload: request };
    this.busyContext.set(context);
    this.errorState.set(null);
    try {
      const result = await this.api.begin(request, token);
      if (!this.isCurrent(context, revision)) {
        if (result.status === 'ready' && result.setup.state !== 'completed')
          void this.api.action(result.setup, 'cancel', token).catch(() => undefined);
        return null;
      }
      if (result.status !== 'ready') {
        // Die Anfrage bleibt bei laufender Bestellung gleich: kein zweiter Kauf beim erneuten Klick.
        if (result.status !== 'purchase_pending') this.pendingRequest = null;
        const message =
          result.status === 'purchase_pending'
            ? CLOUD_PURCHASE_PENDING_MESSAGE
            : result.status === 'purchase_failed'
              ? CLOUD_PURCHASE_FAILED_MESSAGE
              : result.status === 'limit_reached'
                ? CLOUD_IP_LIMIT_MESSAGE
                : result.status === 'price_limit_exceeded'
                  ? CLOUD_PRICE_LIMIT_MESSAGE
                  : CLOUD_CAPACITY_MESSAGE;
        this.errorState.set({ context, message });
        return null;
      }
      this.active.set(
        result.setup.state === 'completed' ? null : { context, setup: result.setup, token },
      );
      this.pendingRequest = null;
      await this.accounts.reloadConnections(result.setup.connectionId);
      return this.isCurrent(context, revision) ? result.setup : null;
    } catch (failure) {
      if (this.isCurrent(context, revision))
        this.errorState.set({
          context,
          message:
            failure instanceof Error && failure.message === CLOUD_SWITCH_BLOCKED_MESSAGE
              ? CLOUD_SWITCH_BLOCKED_MESSAGE
              : CLOUD_CHECK_MESSAGE,
        });
      return null;
    } finally {
      if (this.isCurrent(context, revision)) this.busyContext.set(null);
    }
  }

  clearError(): void {
    this.errorState.set(null);
  }
  async cancel(): Promise<void> {
    this.revision++;
    this.busyContext.set(null);
    this.pendingRequest = null;
    const active = this.active();
    this.active.set(null);
    if (!active) return;
    try {
      await this.api.action(active.setup, 'cancel', active.token);
      if (!this.destroyed && active.context === this.context())
        await this.accounts.reloadConnections(active.setup.connectionId);
    } catch {
      if (!this.destroyed && active.context === this.context())
        this.errorState.set({
          context: active.context,
          message:
            'Die Cloud-Einrichtung wird noch beendet. Die IP bleibt bis zum bestätigten Abschluss reserviert.',
        });
    }
  }
  private async checkAvailability(
    context: string,
    workspaceId: string,
    token: string,
  ): Promise<void> {
    try {
      const allowed = await this.api.available(workspaceId, token);
      if (!this.destroyed && context === this.context())
        this.availability.set({ context, allowed });
    } catch {
      if (!this.destroyed && context === this.context())
        this.availability.set({ context, allowed: false });
    }
  }
  private isCurrent(context: string, revision: number): boolean {
    return !this.destroyed && context === this.context() && revision === this.revision;
  }
}
