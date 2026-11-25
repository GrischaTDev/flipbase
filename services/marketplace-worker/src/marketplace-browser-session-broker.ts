import {
  ChromiumStartError,
  CloudBrowserStopUncertainError,
  CloudBrowserStoppedUncleanlyError,
  type CloudBrowserHandle,
  type BrowserInfo,
} from './gologin-cloud-browser.ts';
import {
  VintedListingReadError,
  vintedListingReadSteps,
  type VintedListingReadStep,
} from './vinted-listing-read-error.ts';

export interface BrowserSessionScope {
  workspaceId: string;
  connectionId: string;
  userId: string;
  userAccessToken: string;
  accountAction?: {
    actionId: string;
    setupId?: string;
    dialogId?: string;
    claimToken: string;
    workerId: string;
    workerEpoch: number;
    runnerId: string;
    sessionId: string;
    expiresAt: string;
    absoluteExpiresAt: string;
  };
  /** Nur nach serverseitiger Einrichtungsprüfung setzen; niemals aus HTTP-Nutzdaten übernehmen. */
  cloudSetup?: { setupId: string };
  /** Interne, ausschließlich lesende Auftragserlaubnis; niemals aus HTTP-Nutzdaten übernehmen. */
  syncRead?: {
    operationId: string;
    authorizationKind?: 'manual_read' | 'scheduled_read';
    runnerId: string;
    workerEpoch: number;
    sessionId: string;
    expiresAt: string;
    absoluteExpiresAt: string;
  };
  /** Interner, dauerhaft gebundener Versandversuch; niemals aus HTTP-Nutzdaten übernehmen. */
  messageWrite?: {
    messageId: string;
    claimToken: string;
    workerId: string;
    workerEpoch: number;
    runnerId: string;
    sessionId: string;
    expiresAt: string;
    absoluteExpiresAt: string;
  };
  negotiationWrite?: {
    jobId: string;
    claimToken: string;
    workerId: string;
    workerEpoch: number;
    runnerId: string;
    sessionId: string;
    expiresAt: string;
    absoluteExpiresAt: string;
  };

  /** Interner Inseratversuch; keine Berechtigung für Nachrichten oder interaktive Aktionen. */
  listingWrite?: {
    jobId: string;
    claimToken: string;
    workerId: string;
    workerEpoch: number;
    runnerId: string;
    sessionId: string;
    expiresAt: string;
    absoluteExpiresAt: string;
  };

  /** Eigene Favoritenphase; keine Freigabe für manuelle Aufträge oder Kontoabrufe. */
  favoriteWrite?: {
    eventId: string;
    phase: 'message' | 'offer';
    claimToken: string;
    workerId: string;
    workerEpoch: number;
    runnerId: string;
    sessionId: string;
    expiresAt: string;
    absoluteExpiresAt: string;
  };
}

export class MarketplaceBrowserSessionBusyError extends Error {
  constructor() {
    super('Eine Browsersitzung läuft bereits oder wird bereinigt');
  }
}

export class MarketplaceBrowserSessionEndedError extends Error {
  readonly reason: 'expired' | 'interrupted';
  readonly isSessionClosed: boolean;
  readonly listingReadStep?: VintedListingReadStep;

  constructor(
    reason: 'expired' | 'interrupted' = 'expired',
    options: { isSessionClosed?: boolean; listingReadStep?: VintedListingReadStep } = {},
  ) {
    super(reason === 'expired' ? 'Sitzung abgelaufen' : 'Browsersitzung unterbrochen');
    this.reason = reason;
    this.isSessionClosed = options.isSessionClosed === true;
    this.listingReadStep = vintedListingReadSteps.find((step) => step === options.listingReadStep);
  }
}

export interface BrowserLease {
  id: string;
  scope: BrowserSessionScope;
  expiresAt: number;
  active: boolean;
}

interface BrowserLeaseStore {
  acquire(scope: BrowserSessionScope): Promise<BrowserLease>;
  assertActive(lease: BrowserLease): Promise<boolean>;
  release(lease: BrowserLease): Promise<void>;
  authorizeScope?(scope: BrowserSessionScope): Promise<void>;
  isClosed?(lease: BrowserLease): Promise<boolean>;
  resolveForCleanup?(lease: BrowserLease): Promise<string>;
}

interface BrowserProfileStore {
  resolve(lease: BrowserLease): Promise<string>;
}

interface CloudBrowserProvider {
  open(profileId: string): Promise<CloudBrowserHandle>;
  stop(profileId: string): Promise<void>;
}

type BrowserStartStage =
  | 'authorization'
  | 'recovery'
  | 'lease_acquire'
  | 'profile_resolve'
  | 'lease_check'
  | 'browser_start'
  | 'lease_confirm';

export type BrowserSessionWorkKind =
  | 'account_action'
  | 'cloud_setup'
  | 'sync'
  | 'message'
  | 'favorite_message'
  | 'favorite_offer'
  | 'negotiation'
  | 'listing'
  | 'interactive';

export interface BrowserSessionTelemetryEvent {
  event: 'marketplace_browser_session_telemetry';
  phase: 'opened' | 'reused' | 'closed';
  kind: BrowserSessionWorkKind;
  activeSessions: number;
  peakConcurrentSessions: number;
  reusedCount: number;
  durationMs?: number;
  uncleanStop?: boolean;
}

interface BrowserSessionBrokerOptions {
  leases: BrowserLeaseStore;
  profiles: BrowserProfileStore;
  browsers: CloudBrowserProvider;
  recovery: { recover(): Promise<void> };
  authorizeRuntime?: () => Promise<boolean>;
  now?: () => number;
  /** Pause zwischen Wiederholungen einer fehlgeschlagenen Leaseprüfung (Standard 1 s). */
  leaseRetryDelayMs?: number;
  onStartFailure?: (stage: BrowserStartStage, detail?: string) => void;
  onSessionEvent?: (event: BrowserSessionTelemetryEvent) => void;
}

interface ActiveBrowserSession {
  lease: BrowserLease;
  profileId: string;
  browser?: CloudBrowserHandle;
  startedAt: number;
  kind: BrowserSessionWorkKind;
  peakConcurrentSessions: number;
  reusedCount: number;
  stopPending: boolean;
  stopPromise?: Promise<void>;
  stopWarning?: CloudBrowserStoppedUncleanlyError;
  reusable?: {
    held: boolean;
    idleSince: number;
    absoluteEnd: number;
    idleCleanup?: ReturnType<typeof setTimeout>;
  };
}

function sessionWorkKind(scope: BrowserSessionScope): BrowserSessionWorkKind {
  if (scope.accountAction) return 'account_action';
  if (scope.cloudSetup) return 'cloud_setup';
  if (scope.syncRead) return 'sync';
  if (scope.messageWrite) return 'message';
  if (scope.favoriteWrite) {
    return scope.favoriteWrite.phase === 'offer' ? 'favorite_offer' : 'favorite_message';
  }
  if (scope.negotiationWrite) return 'negotiation';
  if (scope.listingWrite) return 'listing';
  return 'interactive';
}

function sameScope(left: BrowserSessionScope, right: BrowserSessionScope): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.connectionId === right.connectionId &&
    left.userId === right.userId &&
    left.cloudSetup?.setupId === right.cloudSetup?.setupId &&
    Boolean(left.syncRead) === Boolean(right.syncRead) &&
    Boolean(left.messageWrite) === Boolean(right.messageWrite) &&
    Boolean(left.favoriteWrite) === Boolean(right.favoriteWrite) &&
    Boolean(left.negotiationWrite) === Boolean(right.negotiationWrite) &&
    Boolean(left.listingWrite) === Boolean(right.listingWrite) &&
    Boolean(left.accountAction) === Boolean(right.accountAction) &&
    (!left.accountAction ||
      (left.accountAction.actionId === right.accountAction?.actionId &&
        left.accountAction.claimToken === right.accountAction?.claimToken &&
        left.accountAction.workerId === right.accountAction?.workerId &&
        left.accountAction.workerEpoch === right.accountAction?.workerEpoch &&
        left.accountAction.runnerId === right.accountAction?.runnerId &&
        left.accountAction.sessionId === right.accountAction?.sessionId)) &&
    (!left.listingWrite ||
      (left.listingWrite.jobId === right.listingWrite?.jobId &&
        left.listingWrite.claimToken === right.listingWrite?.claimToken &&
        left.listingWrite.workerId === right.listingWrite?.workerId &&
        left.listingWrite.workerEpoch === right.listingWrite?.workerEpoch &&
        left.listingWrite.runnerId === right.listingWrite?.runnerId &&
        left.listingWrite.sessionId === right.listingWrite?.sessionId)) &&
    (!left.favoriteWrite ||
      (left.favoriteWrite.eventId === right.favoriteWrite?.eventId &&
        left.favoriteWrite.phase === right.favoriteWrite?.phase &&
        left.favoriteWrite.claimToken === right.favoriteWrite?.claimToken &&
        left.favoriteWrite.workerId === right.favoriteWrite?.workerId &&
        left.favoriteWrite.workerEpoch === right.favoriteWrite?.workerEpoch &&
        left.favoriteWrite.runnerId === right.favoriteWrite?.runnerId &&
        left.favoriteWrite.sessionId === right.favoriteWrite?.sessionId)) &&
    (!left.messageWrite ||
      (left.messageWrite.messageId === right.messageWrite?.messageId &&
        left.messageWrite.claimToken === right.messageWrite?.claimToken &&
        left.messageWrite.workerId === right.messageWrite?.workerId &&
        left.messageWrite.workerEpoch === right.messageWrite?.workerEpoch &&
        left.messageWrite.runnerId === right.messageWrite?.runnerId &&
        left.messageWrite.sessionId === right.messageWrite?.sessionId)) &&
    (!left.negotiationWrite ||
      (left.negotiationWrite.jobId === right.negotiationWrite?.jobId &&
        left.negotiationWrite.claimToken === right.negotiationWrite?.claimToken &&
        left.negotiationWrite.workerId === right.negotiationWrite?.workerId &&
        left.negotiationWrite.workerEpoch === right.negotiationWrite?.workerEpoch &&
        left.negotiationWrite.runnerId === right.negotiationWrite?.runnerId &&
        left.negotiationWrite.sessionId === right.negotiationWrite?.sessionId)) &&
    (!left.syncRead ||
      (left.syncRead.operationId === right.syncRead?.operationId &&
        left.syncRead.runnerId === right.syncRead?.runnerId &&
        left.syncRead.workerEpoch === right.syncRead?.workerEpoch))
  );
}

export class MarketplaceBrowserSessionBroker {
  private readonly sessions = new Map<string, ActiveBrowserSession>();
  private readonly options: BrowserSessionBrokerOptions;
  private recovered = false;
  private recoveryPromise?: Promise<void>;
  private readonly openingActions = new Set<string>();

  constructor(options: BrowserSessionBrokerOptions) {
    this.options = options;
  }

  async openAction(scope: BrowserSessionScope): Promise<string> {
    if (scope.syncRead || scope.cloudSetup || scope.accountAction) return this.open(scope);
    const key = `${scope.workspaceId}:${scope.connectionId}`;
    if (this.openingActions.has(key)) throw new MarketplaceBrowserSessionBusyError();
    this.openingActions.add(key);
    try {
      await this.options.leases.authorizeScope?.(scope);
      const now = this.options.now?.() ?? Date.now();
      for (const [id, session] of this.sessions) {
        if (
          session.lease.scope.workspaceId !== scope.workspaceId ||
          session.lease.scope.connectionId !== scope.connectionId
        )
          continue;
        if (!session.reusable || session.reusable.held || session.stopPending)
          throw new MarketplaceBrowserSessionBusyError();
        if (
          sameScope(scope, session.lease.scope) &&
          now - session.reusable.idleSince < 20000 &&
          now < session.reusable.absoluteEnd
        ) {
          clearTimeout(session.reusable.idleCleanup);
          session.reusable.held = true;
          await this.run(scope, id, async () => undefined);
          session.reusedCount += 1;
          const activeSessions = this.recordConcurrentPeak();
          this.emitSessionEvent({
            event: 'marketplace_browser_session_telemetry',
            phase: 'reused',
            kind: sessionWorkKind(scope),
            activeSessions,
            peakConcurrentSessions: session.peakConcurrentSessions,
            reusedCount: session.reusedCount,
          });
          return id;
        }
        if (!sameScope(scope, session.lease.scope)) {
          if (!this.options.leases.authorizeScope) throw new MarketplaceBrowserSessionBusyError();
          await this.options.leases.authorizeScope(scope);
        }
        await this.terminate(id, session);
      }
      const id = await this.open(scope);
      const session = this.find(scope, id);
      session.reusable = {
        held: true,
        idleSince: now,
        absoluteEnd: Math.min(now + 120000, session.lease.expiresAt),
      };
      return id;
    } finally {
      this.openingActions.delete(key);
    }
  }

  async finishAction(scope: BrowserSessionScope, sessionId: string): Promise<void> {
    const session = this.find(scope, sessionId);
    if (!session.reusable) return this.close(scope, sessionId);
    await this.run(scope, sessionId, async () => undefined);
    const now = this.options.now?.() ?? Date.now();
    if (now >= session.reusable.absoluteEnd) return this.terminate(sessionId, session);
    session.reusable.held = false;
    session.reusable.idleSince = now;
    clearTimeout(session.reusable.idleCleanup);
    session.reusable.idleCleanup = setTimeout(
      () => {
        if (this.sessions.get(sessionId) === session && session.reusable && !session.reusable.held)
          void this.terminate(sessionId, session).catch(() => undefined);
      },
      Math.min(20000, Math.max(1, session.reusable.absoluteEnd - now)),
    );
    session.reusable.idleCleanup.unref();
  }

  async handoffCloudSetup(
    scope: BrowserSessionScope,
    sessionId: string,
    setupId: string,
    userAccessToken: string,
  ): Promise<void> {
    if (
      !scope.accountAction ||
      scope.accountAction.sessionId !== sessionId ||
      scope.accountAction.setupId !== setupId ||
      !userAccessToken ||
      !(await this.runtimeAuthorized())
    )
      throw new Error('Einrichtungsübergabe verweigert');
    const session = this.find(scope, sessionId);
    if (session.stopPending) throw new Error('Sitzung wird beendet');
    session.lease.scope = {
      workspaceId: scope.workspaceId,
      connectionId: scope.connectionId,
      userId: scope.userId,
      userAccessToken,
      cloudSetup: { setupId },
    };
    session.lease.expiresAt = Date.parse(scope.accountAction.absoluteExpiresAt);
  }

  async handoffAccountSession(
    scope: BrowserSessionScope,
    sessionId: string,
    dialogId: string,
    userAccessToken: string,
  ): Promise<void> {
    if (
      !scope.accountAction ||
      scope.accountAction.sessionId !== sessionId ||
      scope.accountAction.dialogId !== dialogId ||
      scope.accountAction.setupId ||
      !userAccessToken ||
      !(await this.runtimeAuthorized())
    )
      throw new Error('Anmeldeübergabe verweigert');
    const session = this.find(scope, sessionId);
    if (session.stopPending) throw new Error('Sitzung wird beendet');
    session.lease.scope = {
      workspaceId: scope.workspaceId,
      connectionId: scope.connectionId,
      userId: scope.userId,
      userAccessToken,
    };
    session.lease.expiresAt = Date.parse(scope.accountAction.absoluteExpiresAt);
  }

  async discardUnstartedAction(scope: BrowserSessionScope): Promise<void> {
    const binding = scope.accountAction;
    if (!binding || !(await this.runtimeAuthorized()))
      throw new Error('Auftragsbereinigung verweigert');
    const existing = this.sessions.get(binding.sessionId);
    if (existing) return this.terminate(binding.sessionId, this.find(scope, binding.sessionId));
    const lease = {
      id: binding.sessionId,
      scope: { ...scope },
      expiresAt: Date.parse(binding.expiresAt),
      active: true,
    };
    if (await this.options.leases.isClosed?.(lease)) return;
    const profileId = await (this.options.leases.resolveForCleanup?.(lease) ??
      this.options.profiles.resolve(lease));
    if (!(await this.runtimeAuthorized())) throw new Error('Auftragsbereinigung verweigert');
    try {
      await this.options.browsers.stop(profileId);
    } catch (error) {
      if (!(error instanceof CloudBrowserStoppedUncleanlyError)) throw error;
    }
    await this.options.leases.release(lease);
  }

  /** Vor dem Queue-Claim den freien Browserplatz tatsächlich bereinigen. */
  async prepareDispatch(): Promise<void> {
    for (const [id, session] of this.sessions)
      if (
        session.reusable &&
        !session.reusable.held &&
        !this.openingActions.has(
          `${session.lease.scope.workspaceId}:${session.lease.scope.connectionId}`,
        )
      )
        await this.terminate(id, session);
  }

  async open(scope: BrowserSessionScope): Promise<string> {
    let stage: BrowserStartStage = 'authorization';
    let startDetail: string | undefined;
    try {
      if (
        [
          scope.cloudSetup,
          scope.syncRead,
          scope.messageWrite,
          scope.favoriteWrite,
          scope.negotiationWrite,
          scope.listingWrite,
          scope.accountAction,
        ].filter(Boolean).length > 1
      )
        throw new Error('Sitzungszugriff verweigert');
      if (!(await this.runtimeAuthorized())) throw new Error('Worker-Zugriff unterbrochen');
      stage = 'recovery';
      await this.ensureRecovered();
      stage = 'lease_acquire';
      const lease = await this.options.leases.acquire({ ...scope });
      if (!sameScope(scope, lease.scope)) throw new Error('Sitzungszugriff verweigert');
      let profileId: string | undefined;
      let browser: CloudBrowserHandle | undefined;
      try {
        stage = 'profile_resolve';
        profileId = await this.options.profiles.resolve(lease);
        stage = 'lease_check';
        if (
          lease.expiresAt <= Date.now() ||
          !(await this.options.leases.assertActive(lease)) ||
          lease.expiresAt <= Date.now()
        )
          throw new Error('Sitzung abgelaufen');
        if (!(await this.runtimeAuthorized())) throw new Error('Worker-Zugriff unterbrochen');
        stage = 'browser_start';
        browser = await this.options.browsers.open(profileId);
        stage = 'lease_confirm';
        if (
          lease.expiresAt <= Date.now() ||
          !(await this.options.leases.assertActive(lease)) ||
          lease.expiresAt <= Date.now()
        ) {
          throw new Error('Sitzung abgelaufen');
        }
        const startedAt = this.options.now?.() ?? Date.now();
        const kind = sessionWorkKind(scope);
        const createdSession: ActiveBrowserSession = {
          lease,
          profileId,
          browser,
          startedAt,
          kind,
          peakConcurrentSessions: 1,
          reusedCount: 0,
          stopPending: false,
        };
        this.sessions.set(lease.id, createdSession);
        const activeSessions = this.recordConcurrentPeak();
        this.emitSessionEvent({
          event: 'marketplace_browser_session_telemetry',
          phase: 'opened',
          kind,
          activeSessions,
          peakConcurrentSessions: createdSession.peakConcurrentSessions,
          reusedCount: 0,
        });
        return lease.id;
      } catch (error) {
        const failedStartedAt = this.options.now?.() ?? Date.now();
        const failedKind = sessionWorkKind(scope);
        if (error instanceof ChromiumStartError) startDetail = error.phase + ': ' + error.detail;
        if (!(await this.runtimeAuthorized())) {
          if (profileId)
            this.sessions.set(lease.id, {
              lease,
              profileId,
              browser,
              startedAt: failedStartedAt,
              kind: failedKind,
              peakConcurrentSessions: 1,
              reusedCount: 0,
              stopPending: true,
            });
          // Anbieterfehler können Zugangsdaten enthalten; nur einen festen Zustand weitergeben.
          // eslint-disable-next-line preserve-caught-error
          throw new Error('Browserstart fehlgeschlagen');
        }
        if (error instanceof CloudBrowserStoppedUncleanlyError) {
          await this.options.leases.release(lease);
          throw error;
        }
        if (error instanceof CloudBrowserStopUncertainError) {
          if (profileId)
            this.sessions.set(lease.id, {
              lease,
              profileId,
              startedAt: failedStartedAt,
              kind: failedKind,
              peakConcurrentSessions: 1,
              reusedCount: 0,
              stopPending: true,
            });
          // Anbieterfehler können Token enthalten; die öffentliche Fehlermeldung bleibt neutral.
          // eslint-disable-next-line preserve-caught-error
          throw new Error('Browserstart fehlgeschlagen');
        }
        if (browser) {
          try {
            await browser.close();
          } catch {
            if (profileId)
              this.sessions.set(lease.id, {
                lease,
                profileId,
                browser,
                startedAt: failedStartedAt,
                kind: failedKind,
                peakConcurrentSessions: 1,
                reusedCount: 0,
                stopPending: true,
              });
            throw new Error('Browserstart fehlgeschlagen');
          }
        }
        await this.options.leases.release(lease);
        // Anbieterfehler können Token enthalten; die öffentliche Fehlermeldung bleibt neutral.
        // eslint-disable-next-line preserve-caught-error
        throw new Error('Browserstart fehlgeschlagen');
      }
    } catch (error) {
      try {
        if (startDetail) this.options.onStartFailure?.(stage, startDetail);
        else this.options.onStartFailure?.(stage);
      } catch {
        // Diagnosefehler dürfen weder die Bereinigung noch den ursprünglichen Fehler ersetzen.
      }
      throw error;
    }
  }

  private async ensureRecovered(): Promise<void> {
    if (this.recovered) return;
    this.recoveryPromise ??= this.options.recovery.recover();
    try {
      await this.recoveryPromise;
      this.recovered = true;
    } catch {
      throw new Error('Browser-Bereinigung fehlgeschlagen');
    } finally {
      this.recoveryPromise = undefined;
    }
  }

  async run<T>(
    scope: BrowserSessionScope,
    sessionId: string,
    operation: (browser: BrowserInfo) => Promise<T>,
  ): Promise<T> {
    if (!(await this.runtimeAuthorized()))
      throw new MarketplaceBrowserSessionEndedError('interrupted');
    const session = this.find(scope, sessionId);
    if (session.stopPending) throw new Error('Sitzung wird beendet');
    session.lease.scope.userAccessToken = scope.userAccessToken;
    // Bleibt die Prüfung auch nach Wiederholungen ohne Antwort, läuft keine Browseraktion ohne Beleg.
    let active = (await this.leaseActive(session.lease)) === true;
    if (session.stopPending) throw new Error('Sitzung wird beendet');
    if (session.lease.expiresAt <= Date.now()) active = false;
    if (!active) {
      await this.terminate(sessionId, session);
      throw new MarketplaceBrowserSessionEndedError('expired', { isSessionClosed: true });
    }
    try {
      if (!session.browser) throw new Error('Browser fehlt');
      return await session.browser.run(operation);
    } catch (error) {
      await this.terminate(sessionId, session);
      // Erst nach bestätigtem Browserstopp und Freigabe der Lease ist keine zweite Bereinigung nötig.
      throw new MarketplaceBrowserSessionEndedError('interrupted', {
        isSessionClosed: true,
        listingReadStep: scope.listingWrite
          ? error instanceof VintedListingReadError
            ? error.step
            : error instanceof MarketplaceBrowserSessionEndedError
              ? error.listingReadStep
              : undefined
          : undefined,
      });
    }
  }

  /**
   * Prüft eine Lease beim Server. Verbindungsfehler werden zweimal kurz wiederholt, weil ein
   * einzelner Aussetzer sonst einen laufenden Speichervorgang abbricht und ihn ungeklärt macht.
   * `unknown` heißt: keine Antwort erhalten, aber auch keine Ablehnung.
   */
  private async leaseActive(lease: BrowserLease): Promise<boolean | 'unknown'> {
    const delay = this.options.leaseRetryDelayMs ?? 1_000;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (lease.expiresAt <= Date.now()) return false;
      try {
        return await this.options.leases.assertActive(lease);
      } catch {
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)));
      }
    }
    return 'unknown';
  }

  async close(scope: BrowserSessionScope, sessionId: string): Promise<void> {
    await this.terminate(sessionId, this.find(scope, sessionId));
  }

  async reconcile(): Promise<void> {
    let cleanupFailed = false;
    for (const [id, session] of this.sessions) {
      const checked = await this.leaseActive(session.lease);
      // Ein Verbindungsfehler beendet keinen laufenden Browser, solange seine Lease lokal noch
      // gilt; die nächste Runde prüft erneut. Abgelaufene Leases enden wie bisher.
      let active = checked !== false;
      if (session.lease.expiresAt <= Date.now()) active = false;
      const now = this.options.now?.() ?? Date.now();
      const idle =
        session.reusable &&
        !session.reusable.held &&
        (now - session.reusable.idleSince >= 20000 || now >= session.reusable.absoluteEnd);
      if (!active || session.stopPending || idle) {
        try {
          await this.terminate(id, session);
        } catch {
          cleanupFailed = true;
        }
      }
    }
    if (cleanupFailed) throw new Error('Browser-Stopp fehlgeschlagen');
  }

  async ready(): Promise<void> {
    await this.ensureRecovered();
  }

  async shutdown(): Promise<void> {
    let cleanupFailed = false;
    for (const [id, session] of this.sessions) {
      try {
        await this.terminate(id, session);
      } catch {
        cleanupFailed = true;
      }
    }
    if (cleanupFailed) throw new Error('Browser-Stopp fehlgeschlagen');
  }

  private find(scope: BrowserSessionScope, sessionId: string): ActiveBrowserSession {
    const session = this.sessions.get(sessionId);
    if (!session || !sameScope(session.lease.scope, scope))
      throw new Error('Sitzungszugriff verweigert');
    return session;
  }

  private terminate(sessionId: string, session: ActiveBrowserSession): Promise<void> {
    if (this.sessions.get(sessionId) !== session) return Promise.resolve();
    if (session.stopPromise) return session.stopPromise;
    session.stopPending = true;
    clearTimeout(session.reusable?.idleCleanup);
    session.stopPromise = (async () => {
      try {
        // Ein alter Prozess darf ein inzwischen vom Nachfolger gestartetes Profil nicht stoppen.
        if (!(await this.runtimeAuthorized())) throw new Error('Worker-Zugriff unterbrochen');
        try {
          if (session.browser) await session.browser.close();
          else await this.options.browsers.stop(session.profileId);
        } catch (error) {
          // Dieser Fehler bestätigt bereits das physische Ende. Nur die betroffene
          // Kontoprüfung bleibt offen; der gemeinsame Browserplatz darf wieder frei werden.
          if (!(error instanceof CloudBrowserStoppedUncleanlyError)) throw error;
          session.stopWarning = error;
        }
        await this.options.leases.release(session.lease);
        this.sessions.delete(sessionId);
        if (session.browser) {
          const closedAt = this.options.now?.() ?? Date.now();
          this.emitSessionEvent({
            event: 'marketplace_browser_session_telemetry',
            phase: 'closed',
            kind: session.kind,
            activeSessions: this.activeSessionCount(),
            peakConcurrentSessions: session.peakConcurrentSessions,
            reusedCount: session.reusedCount,
            durationMs: Math.max(0, closedAt - session.startedAt),
            uncleanStop: Boolean(session.stopWarning),
          });
        }
      } catch {
        throw new Error('Browser-Stopp fehlgeschlagen');
      } finally {
        session.stopPromise = undefined;
      }
      if (session.stopWarning) throw session.stopWarning;
    })();
    return session.stopPromise;
  }

  private activeSessionCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (!session.stopPending && session.browser) count += 1;
    }
    return count;
  }

  private recordConcurrentPeak(): number {
    const active = this.activeSessionCount();
    for (const session of this.sessions.values()) {
      if (!session.stopPending && session.browser) {
        session.peakConcurrentSessions = Math.max(session.peakConcurrentSessions, active);
      }
    }
    return active;
  }

  private emitSessionEvent(event: BrowserSessionTelemetryEvent): void {
    try {
      this.options.onSessionEvent?.(event);
    } catch {
      // Telemetriefehler dürfen weder Sitzungsstart noch Bereinigung beeinflussen.
    }
  }

  private async runtimeAuthorized(): Promise<boolean> {
    return this.options.authorizeRuntime ? this.options.authorizeRuntime() : true;
  }
}
