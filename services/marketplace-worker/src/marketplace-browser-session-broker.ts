import {
  CloudBrowserStopUncertainError,
  type CloudBrowserHandle,
  type BrowserInfo,
} from './gologin-cloud-browser.ts';

export interface BrowserSessionScope {
  workspaceId: string;
  connectionId: string;
  userId: string;
  userAccessToken: string;
  /** Nur nach serverseitiger Einrichtungsprüfung setzen; niemals aus HTTP-Nutzdaten übernehmen. */
  cloudSetup?: { setupId: string };
  /** Interne, ausschließlich lesende Auftragserlaubnis; niemals aus HTTP-Nutzdaten übernehmen. */
  syncRead?: {
    operationId: string;
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

  constructor(reason: 'expired' | 'interrupted' = 'expired') {
    super(reason === 'expired' ? 'Sitzung abgelaufen' : 'Browsersitzung unterbrochen');
    this.reason = reason;
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

interface BrowserSessionBrokerOptions {
  leases: BrowserLeaseStore;
  profiles: BrowserProfileStore;
  browsers: CloudBrowserProvider;
  recovery: { recover(): Promise<void> };
  authorizeRuntime?: () => Promise<boolean>;
  now?: () => number;
  onStartFailure?: (stage: BrowserStartStage) => void;
}

interface ActiveBrowserSession {
  lease: BrowserLease;
  profileId: string;
  browser?: CloudBrowserHandle;
  stopPending: boolean;
  stopPromise?: Promise<void>;
  reusable?: {
    held: boolean;
    idleSince: number;
    absoluteEnd: number;
    idleCleanup?: ReturnType<typeof setTimeout>;
  };
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
  private openingAction = false;

  constructor(options: BrowserSessionBrokerOptions) {
    this.options = options;
  }

  async openAction(scope: BrowserSessionScope): Promise<string> {
    if (scope.syncRead || scope.cloudSetup) return this.open(scope);
    if (this.openingAction) throw new MarketplaceBrowserSessionBusyError();
    this.openingAction = true;
    try {
      const now = this.options.now?.() ?? Date.now();
      for (const [id, session] of this.sessions) {
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
      this.openingAction = false;
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

  /** Vor dem Queue-Claim den freien Browserplatz tatsächlich bereinigen. */
  async prepareDispatch(): Promise<void> {
    if (this.openingAction) return;
    this.openingAction = true;
    try {
      for (const [id, session] of this.sessions)
        if (session.reusable && !session.reusable.held) await this.terminate(id, session);
    } finally {
      this.openingAction = false;
    }
  }

  async open(scope: BrowserSessionScope): Promise<string> {
    let stage: BrowserStartStage = 'authorization';
    try {
      if (
        [scope.cloudSetup, scope.syncRead, scope.messageWrite, scope.favoriteWrite].filter(Boolean)
          .length > 1
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
        this.sessions.set(lease.id, { lease, profileId, browser, stopPending: false });
        return lease.id;
      } catch (error) {
        if (!(await this.runtimeAuthorized())) {
          if (profileId)
            this.sessions.set(lease.id, { lease, profileId, browser, stopPending: true });
          // Anbieterfehler können Zugangsdaten enthalten; nur einen festen Zustand weitergeben.
          // eslint-disable-next-line preserve-caught-error
          throw new Error('Browserstart fehlgeschlagen');
        }
        if (error instanceof CloudBrowserStopUncertainError) {
          if (profileId) this.sessions.set(lease.id, { lease, profileId, stopPending: true });
          // Anbieterfehler können Token enthalten; die öffentliche Fehlermeldung bleibt neutral.
          // eslint-disable-next-line preserve-caught-error
          throw new Error('Browserstart fehlgeschlagen');
        }
        if (browser) {
          try {
            await browser.close();
          } catch {
            if (profileId)
              this.sessions.set(lease.id, { lease, profileId, browser, stopPending: true });
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
        this.options.onStartFailure?.(stage);
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
    let active: boolean;
    try {
      active =
        session.lease.expiresAt > Date.now() &&
        (await this.options.leases.assertActive(session.lease));
    } catch {
      active = false;
    }
    if (session.stopPending) throw new Error('Sitzung wird beendet');
    if (session.lease.expiresAt <= Date.now()) active = false;
    if (!active) {
      await this.terminate(sessionId, session);
      throw new MarketplaceBrowserSessionEndedError('expired');
    }
    try {
      if (!session.browser) throw new Error('Browser fehlt');
      return await session.browser.run(operation);
    } catch {
      await this.terminate(sessionId, session);
      throw new MarketplaceBrowserSessionEndedError('interrupted');
    }
  }

  async close(scope: BrowserSessionScope, sessionId: string): Promise<void> {
    await this.terminate(sessionId, this.find(scope, sessionId));
  }

  async reconcile(): Promise<void> {
    let cleanupFailed = false;
    for (const [id, session] of this.sessions) {
      let active: boolean;
      try {
        active =
          session.lease.expiresAt > Date.now() &&
          (await this.options.leases.assertActive(session.lease));
      } catch {
        active = false;
      }
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
        if (session.browser) await session.browser.close();
        else await this.options.browsers.stop(session.profileId);
        await this.options.leases.release(session.lease);
        this.sessions.delete(sessionId);
      } catch {
        throw new Error('Browser-Stopp fehlgeschlagen');
      } finally {
        session.stopPromise = undefined;
      }
    })();
    return session.stopPromise;
  }

  private async runtimeAuthorized(): Promise<boolean> {
    return this.options.authorizeRuntime ? this.options.authorizeRuntime() : true;
  }
}
