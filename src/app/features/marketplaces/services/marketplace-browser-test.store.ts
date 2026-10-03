import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import type { AccountScope } from '../models/marketplace.models';
import { MarketplaceAccountStore } from './marketplace-account.store';
import {
  BrowserTestSessionEndedError,
  GoLoginApiLimitError,
  GoLoginProfileLimitError,
  VintedLoginPendingError,
  VintedLoginRejectedError,
  VintedVerificationRequiredError,
  VintedInteractionRequiredError,
  VintedSessionBlockedError,
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
  private readonly outdatedState = signal(false);
  private readonly availabilityCheckedState = signal(false);
  private readonly readOnlyState = signal(true);
  private readonly dragSupportedState = signal(false);
  private revision = 0;
  private destroyed = false;
  private readonly loginKey = signal<string | null>(null);
  private readonly loginNeedsClose = signal<string | null>(null);
  private readonly loginPagePendingKey = signal<string | null>(null);
  private readonly verificationKey = signal<string | null>(null);
  private readonly interactionRequiredKey = signal<string | null>(null);
  private readonly sessionBlockedKey = signal<string | null>(null);
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
  readonly awaitingVerification = computed(
    () => this.awaitingLogin() && this.verificationKey() === this.contextKey(),
  );
  readonly interactionRequired = computed(
    () => this.session() !== null && this.interactionRequiredKey() === this.contextKey(),
  );
  readonly sessionBlocked = computed(
    () => this.session() !== null && this.sessionBlockedKey() === this.contextKey(),
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
  readonly outdated = this.outdatedState.asReadonly();
  readonly availabilityChecked = this.availabilityCheckedState.asReadonly();
  readonly readOnly = this.readOnlyState.asReadonly();
  readonly dragSupported = this.dragSupportedState.asReadonly();
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
  readonly canAct = computed(
    () => this.session() !== null && !this.busy() && !this.sessionBlocked(),
  );
  readonly canLogin = computed(
    () =>
      !this.readOnly() &&
      !this.awaitingLogin() &&
      !this.interactionRequired() &&
      !this.sessionBlocked() &&
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
      this.outdatedState.set(availability.outdated === true);
      this.readOnlyState.set(availability.readOnly);
      this.dragSupportedState.set(availability.dragSupported === true && !availability.readOnly);
    } catch {
      this.dragSupportedState.set(false);
      this.availableState.set(false);
      this.outdatedState.set(false);
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
    this.sessionBlockedKey.set(null);
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
    if (
      !active ||
      this.busy() ||
      this.readOnly() ||
      this.sessionBlocked() ||
      (input.kind === 'drag' && !this.dragSupported())
    )
      return;
    const revision = ++this.revision;
    this.busyState.set(active.key);
    this.errorState.set(null);
    try {
      const token = this.currentToken();
      await this.api.input(active.scope, active.id, input, token);
      await this.loadFrame(active.key, revision, active.scope, active.id, token);
    } catch (error) {
      if (this.isCurrent(active.key, revision) && error instanceof VintedSessionBlockedError) {
        await this.pauseForBlockedSession(active, revision);
        return;
      }
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
    this.loginPagePendingKey.set(null);
    this.verificationKey.set(null);
    this.interactionRequiredKey.set(null);
    this.sessionBlockedKey.set(null);
    this.progressState.set({ key, message: 'Die Anmeldung bei Vinted läuft im Hintergrund …' });
    let confirmedByWorker = false;
    try {
      const result = await this.api.login(
        active.scope,
        active.id,
        credentials,
        this.currentToken(),
      );
      if (!this.isCurrent(key, revision)) return;
      if (result === 'already_authenticated') {
        confirmedByWorker = true;
        await this.completeConfirmedAccount(active, revision, this.currentToken());
        return;
      }
      if (result === 'verification_required') {
        this.loginDeadline = Date.now() + 120_000;
        this.verificationKey.set(key);
        this.progressState.set(null);
        return;
      }
      if (result === 'session_blocked') {
        await this.pauseForBlockedSession(active, revision);
        return;
      }
      if (result === 'interaction_required') {
        await this.pauseForInteraction(active, revision);
        return;
      }
      if (result === 'form_unavailable') {
        this.loginKey.set(null);
        await this.loadFrame(key, revision, active.scope, active.id, this.currentToken()).catch(
          () => undefined,
        );
        this.errorState.set({
          key,
          message:
            'Das Vinted-Anmeldeformular konnte nicht automatisch bedient werden. Möglicherweise verlangt Vinted eine zusätzliche Prüfung. In der Browser-Ansicht unten kannst Du die Prüfung direkt bedienen.',
        });
        return;
      }
      this.loginDeadline = Date.now() + 60_000;
      this.progressState.set({
        key,
        message: active.frameUrl
          ? 'Die Anmeldung wurde gesendet. Klicke nach der Vinted-Bestätigung auf „Anmeldung prüfen & verbinden“.'
          : 'Anmeldung wird geprüft. Dein Konto wird nach bestätigter Anmeldung automatisch verbunden …',
      });
    } catch (error) {
      if (this.isCurrent(key, revision)) this.loginKey.set(null);
      if (this.isCurrent(key, revision) && !this.handleConfirmedEnd(error, key)) {
        this.loginNeedsClose.set(key);
        this.errorState.set({
          key,
          message: confirmedByWorker
            ? 'Dein Vinted-Konto wurde bestätigt, aber die Browsersitzung konnte nicht sicher beendet werden. Beende den Versuch.'
            : 'Die Anmeldung ist nicht bestätigt. Deine Eingaben werden nicht automatisch erneut gesendet. Beende den Versuch, bevor Du Dich erneut anmeldest.',
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
            this.verificationKey() === key
              ? 'Der Bestätigungscode wurde nicht rechtzeitig eingegeben. Beende den Versuch und starte die Anmeldung erneut.'
              : this.loginPagePendingKey() === key
                ? 'Vinted zeigt nach einer Minute weiterhin das Anmeldeformular. Die Anmeldung wurde dort nicht bestätigt. Dein Konto wurde nicht verbunden. Beende den Versuch, bevor Du Dich erneut anmeldest.'
                : 'Die Anmeldung wurde innerhalb einer Minute nicht bestätigt. Vinted kann eine zusätzliche Bestätigung verlangen; auch der Kontodatenabruf kann fehlgeschlagen sein. Dein Konto wurde nicht als verbunden markiert. Beende den Versuch und melde Dich später erneut an.',
        });
      return;
    }
    if (this.awaitingVerification()) return;
    await this.confirmAccount(true);
  }

  async verifyCode(code: string): Promise<void> {
    const active = this.session();
    if (!active || !this.awaitingVerification() || this.busy() || !/^[0-9]{4,8}$/.test(code))
      return;
    if (Date.now() >= this.loginDeadline) {
      await this.checkLogin();
      return;
    }
    const revision = ++this.revision;
    this.busyState.set(active.key);
    this.errorState.set(null);
    try {
      const result = await this.api.verify(active.scope, active.id, code, this.currentToken());
      if (!this.isCurrent(active.key, revision)) return;
      if (result === 'session_blocked') {
        await this.pauseForBlockedSession(active, revision);
        return;
      }
      if (result === 'interaction_required') {
        await this.pauseForInteraction(active, revision);
        return;
      }
      if (result === 'form_unavailable') {
        this.errorState.set({
          key: active.key,
          message:
            'Das Vinted-Codeformular konnte nicht sicher bedient werden. Dein Code wurde nicht gesendet. Prüfe die offene Anmeldung oder beende sie und starte neu.',
        });
        return;
      }
      if (result === 'submission_unconfirmed') {
        this.loginKey.set(null);
        this.loginNeedsClose.set(active.key);
        this.errorState.set({
          key: active.key,
          message:
            'Ob Vinted den Code angenommen hat, ist unklar. Beende den Versuch und starte ihn bei Bedarf neu.',
        });
        return;
      }
      this.verificationKey.set(null);
      this.loginDeadline = Date.now() + 60_000;
      this.progressState.set({
        key: active.key,
        message: active.frameUrl
          ? 'Code gesendet. Klicke nach der Vinted-Bestätigung auf „Anmeldung prüfen & verbinden“.'
          : 'Code gesendet. Die Anmeldung wird geprüft …',
      });
    } catch (error) {
      if (this.isCurrent(active.key, revision) && !this.handleConfirmedEnd(error, active.key)) {
        this.loginKey.set(null);
        this.loginNeedsClose.set(active.key);
        this.errorState.set({
          key: active.key,
          message:
            'Der Code konnte nicht sicher gesendet werden. Beende den Versuch und melde Dich erneut an.',
        });
      }
    } finally {
      if (this.isCurrent(active.key, revision)) this.busyState.set(null);
    }
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
      if (!this.isCurrent(active.key, revision)) return;
      if (!identity) {
        this.loginPagePendingKey.set(null);
        return;
      }
      await this.completeConfirmedAccount(active, revision, token);
    } catch (error) {
      if (this.isCurrent(active.key, revision) && error instanceof VintedSessionBlockedError) {
        await this.pauseForBlockedSession(active, revision);
        return;
      }
      if (this.isCurrent(active.key, revision) && error instanceof VintedInteractionRequiredError) {
        await this.pauseForInteraction(active, revision);
        return;
      }
      if (this.isCurrent(active.key, revision) && error instanceof VintedLoginPendingError) {
        if (allowPending) {
          this.loginPagePendingKey.set(active.key);
          this.progressState.set({
            key: active.key,
            message:
              'Vinted zeigt noch das Anmeldeformular. Falls eine SMS-Bestätigung erscheint, kannst Du den Code gleich hier eingeben. Du kannst den Versuch jederzeit beenden.',
          });
          return;
        }
        this.loginKey.set(null);
        this.loginNeedsClose.set(active.key);
        this.errorState.set({ key: active.key, message: error.message });
        return;
      }
      if (
        this.isCurrent(active.key, revision) &&
        error instanceof VintedVerificationRequiredError
      ) {
        if (this.verificationKey() !== active.key) this.loginDeadline = Date.now() + 120_000;
        this.interactionRequiredKey.set(null);
        this.loginKey.set(active.key);
        this.verificationKey.set(active.key);
        this.progressState.set(null);
        return;
      }
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
    this.loginPagePendingKey.set(null);
    this.verificationKey.set(null);
    this.interactionRequiredKey.set(null);
    this.sessionBlockedKey.set(null);
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
    const frameUrl = URL.createObjectURL(frame.image);
    this.state.set({ ...old, frameUrl });
    this.releaseFrame(old.frameUrl);
    if (frame.sessionBlocked) this.markSessionBlocked(key);
  }

  private async completeConfirmedAccount(
    active: BrowserTestSession,
    revision: number,
    token: string,
  ): Promise<void> {
    await this.api.close(active.scope, active.id, token);
    if (!this.isCurrent(active.key, revision)) return;
    this.releaseFrame(active.frameUrl);
    this.state.set(null);
    this.loginKey.set(null);
    this.loginPagePendingKey.set(null);
    this.verificationKey.set(null);
    this.interactionRequiredKey.set(null);
    this.sessionBlockedKey.set(null);
    this.progressState.set(null);
    try {
      await this.accounts.reloadConnections(active.scope.connectionId);
    } catch {
      this.errorState.set({
        key: active.key,
        message:
          'Dein Vinted-Konto wurde bestätigt. Lade die Kontoliste erneut, um den Status zu sehen.',
      });
    }
  }

  private currentToken(): string {
    const token = this.auth.session()?.access_token;
    if (!token) throw new Error('Anmeldung fehlt');
    return token;
  }

  private async pauseForInteraction(active: BrowserTestSession, revision: number): Promise<void> {
    this.loginKey.set(null);
    this.loginPagePendingKey.set(null);
    this.verificationKey.set(null);
    this.progressState.set(null);
    this.interactionRequiredKey.set(active.key);
    try {
      await this.loadFrame(active.key, revision, active.scope, active.id, this.currentToken());
    } catch (error) {
      if (this.isCurrent(active.key, revision) && !this.handleConfirmedEnd(error, active.key))
        this.errorState.set({
          key: active.key,
          message:
            'Das Browserbild konnte nicht geladen werden. Klicke auf „Bild laden“, um die Prüfung zu öffnen.',
        });
    }
  }

  private async pauseForBlockedSession(
    active: BrowserTestSession,
    revision: number,
  ): Promise<void> {
    this.markSessionBlocked(active.key);
    try {
      await this.loadFrame(active.key, revision, active.scope, active.id, this.currentToken());
    } catch (error) {
      if (this.isCurrent(active.key, revision) && !this.handleConfirmedEnd(error, active.key))
        this.errorState.set({
          key: active.key,
          message:
            'Vinted hat die Sitzung blockiert. Das letzte Browserbild konnte nicht geladen werden.',
        });
    }
  }

  private markSessionBlocked(key: string): void {
    this.loginKey.set(null);
    this.loginPagePendingKey.set(null);
    this.verificationKey.set(null);
    this.interactionRequiredKey.set(null);
    this.progressState.set(null);
    this.sessionBlockedKey.set(key);
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
        error instanceof GoLoginApiLimitError || error instanceof GoLoginProfileLimitError
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
    this.loginPagePendingKey.set(null);
    this.verificationKey.set(null);
    this.interactionRequiredKey.set(null);
    this.sessionBlockedKey.set(null);
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
