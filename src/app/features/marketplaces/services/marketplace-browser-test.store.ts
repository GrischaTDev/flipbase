import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { AccountScope } from '../models/marketplace.models';
import { MarketplaceAccountStore } from './marketplace-account.store';
import {
  BrowserTestSessionEndedError,
  GoLoginApiLimitError,
  VintedLoginRejectedError,
  MarketplaceBrowserTestApiService,
  type BrowserTestInput,
  type VintedLoginCredentials,
} from './marketplace-browser-test-api.service';

interface BrowserTestSession {
  key: string;
  userId: string;
  scope: AccountScope;
  accessToken: string;
  id: string;
  frameUrl: string | null;
}

@Injectable()
export class MarketplaceBrowserTestStore {
  private readonly accounts = inject(MarketplaceAccountStore);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);
  private readonly api = inject(MarketplaceBrowserTestApiService);
  private readonly state = signal<BrowserTestSession | null>(null);
  private readonly busyState = signal<string | null>(null);
  private readonly errorState = signal<{ key: string; message: string } | null>(null);
  private readonly availableState = signal(false);
  private readonly availabilityCheckedState = signal(false);
  private readonly readOnlyState = signal(true);
  private revision = 0;
  private destroyed = false;
  private readonly loginKey = signal<string | null>(null);
  private readonly loginNeedsClose = signal<string | null>(null);
  private loginDeadline = 0;
  private readonly progressState = signal<{ key: string; message: string } | null>(null);
  readonly progress = computed(() => {
    const state = this.progressState();
    return state?.key === this.contextKey() &&
      !this.error() &&
      (this.busy() || this.awaitingLogin())
      ? state.message
      : null;
  });
  readonly awaitingLogin = computed(
    () => this.session() !== null && this.loginKey() === this.contextKey(),
  );

  private readonly contextKey = computed(() => {
    const userId = this.auth.currentUser()?.id;
    const token = this.auth.session()?.access_token;
    const currentWorkspace = this.workspace.currentWorkspace();
    const account = this.accounts.selectedConnection();
    return userId &&
      token &&
      currentWorkspace &&
      !currentWorkspace.archived_at &&
      this.accounts.canManage() &&
      account?.workspaceId === currentWorkspace.id
      ? JSON.stringify([
          userId,
          currentWorkspace.id,
          account.connectionId,
          this.accounts.selectionVersion(),
        ])
      : null;
  });

  readonly connection = computed(() =>
    this.contextKey() === null ? null : this.accounts.selectedConnection(),
  );
  readonly session = computed(() => {
    const state = this.state();
    return state?.key === this.contextKey() ? state : null;
  });
  readonly available = this.availableState.asReadonly();
  readonly availabilityChecked = this.availabilityCheckedState.asReadonly();
  readonly readOnly = this.readOnlyState.asReadonly();
  readonly busy = computed(
    () => this.busyState() === this.contextKey() && this.busyState() !== null,
  );
  readonly error = computed(() => {
    const state = this.errorState();
    return state?.key === this.contextKey() ? state.message : null;
  });
  readonly canStart = computed(() => {
    const connection = this.connection();
    return (
      this.available() &&
      connection !== null &&
      connection.status !== 'paused' &&
      connection.status !== 'blocked' &&
      !this.session() &&
      !this.busy()
    );
  });
  readonly canAct = computed(() => this.session() !== null && !this.busy());
  readonly canLogin = computed(
    () =>
      !this.readOnly() &&
      !this.awaitingLogin() &&
      this.loginNeedsClose() !== this.contextKey() &&
      (this.canStart() || this.canAct()),
  );

  constructor() {
    effect(() => {
      const key = this.contextKey();
      const active = this.state();
      if (active && active.key !== key) {
        this.state.set(null);
        this.releaseFrame(active.frameUrl);
        void this.api
          .close(active.scope, active.id, this.cleanupToken(active))
          .catch(() => undefined);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.revision += 1;
      const active = this.state();
      if (active) {
        this.releaseFrame(active.frameUrl);
        void this.api
          .close(active.scope, active.id, this.cleanupToken(active))
          .catch(() => undefined);
      }
    });
  }

  async checkAvailability(): Promise<void> {
    try {
      const availability = await this.api.available();
      this.availableState.set(availability.available);
      this.readOnlyState.set(availability.readOnly);
    } catch {
      this.availableState.set(false);
      this.readOnlyState.set(true);
    } finally {
      this.availabilityCheckedState.set(true);
    }
  }

  async start(loadPreview = true): Promise<void> {
    const connection = this.connection();
    const key = this.contextKey();
    const token = this.auth.session()?.access_token;
    const userId = this.auth.currentUser()?.id;
    if (!connection || !key || !token || !userId || !this.canStart()) return;
    const scope = { workspaceId: connection.workspaceId, connectionId: connection.connectionId };
    const revision = ++this.revision;
    this.busyState.set(key);
    this.errorState.set(null);
    try {
      const id = await this.api.open(scope, token);
      if (!this.isCurrent(key, revision)) {
        void this.api.close(scope, id, token).catch(() => undefined);
        return;
      }
      this.state.set({ key, userId, scope, accessToken: token, id, frameUrl: null });
      if (loadPreview) await this.loadFrame(key, revision, scope, id, token);
    } catch (error) {
      if (this.isCurrent(key, revision) && !this.handleConfirmedEnd(error, key))
        this.setError(key, error);
    } finally {
      if (this.isCurrent(key, revision)) this.busyState.set(null);
    }
  }

  async refresh(): Promise<void> {
    const active = this.session();
    if (!active || this.busy()) return;
    const revision = ++this.revision;
    this.busyState.set(active.key);
    this.errorState.set(null);
    try {
      await this.loadFrame(active.key, revision, active.scope, active.id, this.currentToken());
    } catch (error) {
      if (this.isCurrent(active.key, revision)) {
        if (this.handleConfirmedEnd(error, active.key)) return;
        const current = this.session();
        if (current?.id === active.id) {
          this.releaseFrame(current.frameUrl);
          this.state.set({ ...current, frameUrl: null });
        }
        this.setError(active.key);
      }
    } finally {
      if (this.isCurrent(active.key, revision)) this.busyState.set(null);
    }
  }

  async input(input: BrowserTestInput): Promise<void> {
    const active = this.session();
    if (!active || this.busy() || this.readOnly()) return;
    const revision = ++this.revision;
    this.busyState.set(active.key);
    this.errorState.set(null);
    try {
      const token = this.currentToken();
      await this.api.input(active.scope, active.id, input, token);
      await this.loadFrame(active.key, revision, active.scope, active.id, token);
    } catch (error) {
      if (this.isCurrent(active.key, revision) && !this.handleConfirmedEnd(error, active.key))
        this.errorState.set({
          key: active.key,
          message: 'Die Eingabe ist nicht sicher bestätigt. Prüfe zuerst das Browserbild.',
        });
    } finally {
      if (this.isCurrent(active.key, revision)) this.busyState.set(null);
    }
  }

  async login(credentials: VintedLoginCredentials): Promise<void> {
    const key = this.contextKey();
    if (
      !key ||
      this.readOnly() ||
      this.busy() ||
      !credentials.username.trim() ||
      !credentials.password
    )
      return;
    if (!this.canLogin()) return;
    this.progressState.set({ key, message: 'Deine Kontoverbindung wird vorbereitet …' });
    if (!this.session()) await this.start(false);
    const active = this.session();
    if (!active || active.key !== key || this.busy()) return;
    const revision = ++this.revision;
    this.busyState.set(key);
    this.errorState.set(null);
    this.loginKey.set(key);
    this.progressState.set({ key, message: 'Die Anmeldung bei Vinted läuft im Hintergrund …' });
    try {
      const result = await this.api.login(
        active.scope,
        active.id,
        credentials,
        this.currentToken(),
      );
      if (!this.isCurrent(key, revision)) return;
      if (result === 'form_unavailable' || result === 'interaction_required') {
        this.loginKey.set(null);
        this.errorState.set({
          key,
          message:
            'Das Vinted-Anmeldeformular konnte nicht automatisch bedient werden. Möglicherweise verlangt Vinted eine zusätzliche Prüfung. Dein Konto ist noch nicht verbunden.',
        });
        return;
      }
      this.loginDeadline = Date.now() + 60_000;
      this.progressState.set({
        key,
        message:
          'Anmeldung wird geprüft. Dein Konto wird nach bestätigter Anmeldung automatisch verbunden …',
      });
    } catch (error) {
      if (this.isCurrent(key, revision)) this.loginKey.set(null);
      if (this.isCurrent(key, revision) && !this.handleConfirmedEnd(error, key)) {
        this.loginNeedsClose.set(key);
        this.errorState.set({
          key,
          message:
            'Die Anmeldung ist nicht bestätigt. Deine Eingaben werden nicht automatisch erneut gesendet. Beende den Versuch, bevor Du Dich erneut anmeldest.',
        });
      }
    } finally {
      if (this.isCurrent(key, revision)) this.busyState.set(null);
    }
  }

  async checkLogin(): Promise<void> {
    if (!this.awaitingLogin() || this.busy() || this.error()) return;
    if (Date.now() >= this.loginDeadline) {
      const key = this.contextKey();
      this.loginKey.set(null);
      this.loginNeedsClose.set(key);
      if (key)
        this.errorState.set({
          key,
          message:
            'Die Anmeldung wurde innerhalb einer Minute nicht bestätigt. Vinted kann eine zusätzliche Bestätigung verlangen; auch der Kontodatenabruf kann fehlgeschlagen sein. Dein Konto wurde nicht als verbunden markiert. Beende den Versuch und melde Dich später erneut an.',
        });
      return;
    }
    await this.confirmAccount(true);
  }

  async confirmAccount(allowPending = false): Promise<void> {
    const active = this.session();
    if (!active || this.busy() || this.readOnly()) return;
    const revision = ++this.revision;
    this.busyState.set(active.key);
    this.errorState.set(null);
    try {
      const token = this.currentToken();
      const identity = allowPending
        ? await this.api.identify(active.scope, active.id, token, true)
        : await this.api.identify(active.scope, active.id, token);
      if (!identity) {
        return;
      }
      if (!this.isCurrent(active.key, revision)) return;
      await this.api.close(active.scope, active.id, token);
      if (!this.isCurrent(active.key, revision)) return;
      this.releaseFrame(active.frameUrl);
      this.state.set(null);
      this.loginKey.set(null);
      this.progressState.set(null);
      await this.accounts.reloadConnections(active.scope.connectionId);
    } catch (error) {
      if (this.isCurrent(active.key, revision)) this.loginKey.set(null);
      if (this.isCurrent(active.key, revision) && error instanceof VintedLoginRejectedError) {
        this.loginKey.set(null);
        this.errorState.set({ key: active.key, message: error.message });
        return;
      }
      if (this.isCurrent(active.key, revision) && !this.handleConfirmedEnd(error, active.key)) {
        this.loginNeedsClose.set(active.key);
        this.errorState.set({
          key: active.key,
          message:
            'Die Vinted-Anmeldung konnte nicht sicher bestätigt oder beendet werden. Beende den Versuch und melde Dich anschließend erneut an.',
        });
      }
    } finally {
      if (this.isCurrent(active.key, revision)) this.busyState.set(null);
    }
  }

  async close(): Promise<void> {
    const active = this.session();
    if (!active) return;
    const revision = ++this.revision;
    this.loginKey.set(null);
    this.progressState.set(null);
    this.busyState.set(active.key);
    this.errorState.set(null);
    try {
      await this.api.close(active.scope, active.id, this.currentToken());
      if (this.isCurrent(active.key, revision)) {
        this.releaseFrame(active.frameUrl);
        this.state.set(null);
        this.loginNeedsClose.set(null);
      }
    } catch {
      if (this.isCurrent(active.key, revision)) {
        this.loginNeedsClose.set(active.key);
        this.errorState.set({
          key: active.key,
          message: 'Das Beenden der Anmeldung ist nicht bestätigt. Versuche das Beenden erneut.',
        });
      }
    } finally {
      if (this.isCurrent(active.key, revision)) this.busyState.set(null);
    }
  }

  private async loadFrame(
    key: string,
    revision: number,
    scope: AccountScope,
    id: string,
    token: string,
  ): Promise<void> {
    const frame = await this.api.frame(scope, id, token);
    if (!this.isCurrent(key, revision)) return;
    const old = this.session();
    if (!old || old.id !== id) return;
    const frameUrl = URL.createObjectURL(frame);
    this.state.set({ ...old, frameUrl });
    this.releaseFrame(old.frameUrl);
  }

  private currentToken(): string {
    const token = this.auth.session()?.access_token;
    if (!token) throw new Error('Anmeldung fehlt');
    return token;
  }

  private cleanupToken(active: BrowserTestSession): string {
    return this.auth.currentUser()?.id === active.userId
      ? (this.auth.session()?.access_token ?? active.accessToken)
      : active.accessToken;
  }

  private isCurrent(key: string, revision: number): boolean {
    return !this.destroyed && this.contextKey() === key && this.revision === revision;
  }

  private setError(key: string, error?: unknown): void {
    this.errorState.set({
      key,
      message:
        error instanceof GoLoginApiLimitError
          ? error.message
          : 'Die Browsersitzung konnte nicht bestätigt werden.',
    });
  }

  private handleConfirmedEnd(error: unknown, key: string): boolean {
    if (!(error instanceof BrowserTestSessionEndedError)) return false;
    const active = this.session();
    if (active) this.releaseFrame(active.frameUrl);
    this.state.set(null);
    this.loginNeedsClose.set(null);
    this.errorState.set({
      key,
      message: 'Die Browsersitzung wurde beendet. Du kannst die Anmeldung erneut öffnen.',
    });
    return true;
  }

  private releaseFrame(url: string | null): void {
    if (url) URL.revokeObjectURL(url);
  }
}
