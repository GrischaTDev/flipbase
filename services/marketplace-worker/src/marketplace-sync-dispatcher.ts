import { randomUUID } from 'node:crypto';
import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';

export interface RuntimeLease {
  workerId: string;
  workerEpoch: number;
  expiresAt: string;
}
export interface MarketplaceSyncDispatchStore {
  acquireWorker(workerId: string): Promise<RuntimeLease | null>;
  heartbeatWorker(workerId: string, workerEpoch: number): Promise<boolean>;
  releaseWorker(workerId: string, workerEpoch: number): Promise<boolean>;
  recover(workerId: string, workerEpoch: number): Promise<{ interruptedOperations: number }>;
  claim(
    workerId: string,
    workerEpoch: number,
    runnerId: string,
    includeScheduled?: boolean,
  ): Promise<BrowserSessionScope | null>;
}
export interface MarketplaceSyncTimers {
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
}
interface DispatcherOptions {
  store: MarketplaceSyncDispatchStore;
  run(scope: BrowserSessionScope): Promise<void>;
  onRuntimeLost(): void | Promise<void>;
  includeScheduled?: boolean;
  workerId?: string;
  createRunnerId?: () => string;
  timers?: MarketplaceSyncTimers;
  now?: () => number;
}
export class MarketplaceSyncDispatcher {
  private readonly options: DispatcherOptions;
  private readonly workerId: string;
  private readonly createRunnerId: () => string;
  private readonly now: () => number;
  private readonly timers: MarketplaceSyncTimers;
  private lease: RuntimeLease | null = null;
  private initializing?: Promise<RuntimeLease>;
  private polling?: Promise<void>;
  private heartbeating?: Promise<boolean>;
  private releasing?: Promise<void>;
  private pollTimer?: unknown;
  private heartbeatTimer?: unknown;
  private started = false;
  private stopped = false;
  private lost = false;

  constructor(options: DispatcherOptions) {
    this.options = options;
    this.workerId = options.workerId ?? randomUUID();
    this.createRunnerId = options.createRunnerId ?? randomUUID;
    this.now = options.now ?? Date.now;
    this.timers = options.timers ?? {
      setInterval: (callback, milliseconds) => setInterval(callback, milliseconds).unref(),
      clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
    };
  }

  get runtimeActive(): boolean {
    return !this.lost && this.lease !== null && Date.parse(this.lease.expiresAt) > this.now();
  }

  get ready(): boolean {
    return this.started && !this.stopped && this.runtimeActive;
  }

  get scheduledEnabled(): boolean {
    return this.ready && this.options.includeScheduled === true;
  }

  initialize(): Promise<RuntimeLease> {
    this.initializing ??= this.acquireRuntime();
    return this.initializing;
  }

  private async acquireRuntime(): Promise<RuntimeLease> {
    const lease = await this.options.store.acquireWorker(this.workerId);
    if (!lease) throw new Error('Vinted-Worker läuft bereits');
    this.lease = Object.freeze({ ...lease });
    if (!this.runtimeActive) throw new Error('Vinted-Workerberechtigung abgelaufen');
    return this.lease;
  }

  async poll(): Promise<void> {
    if (this.stopped || !this.checkRuntime() || this.polling) return;
    const running = this.claimAndRun();
    this.polling = running;
    try {
      await running;
    } finally {
      this.polling = undefined;
    }
  }

  private async claimAndRun(): Promise<void> {
    const lease = this.lease;
    if (!lease) return;
    let scope: BrowserSessionScope | null;
    try {
      scope = await this.options.store.claim(
        lease.workerId,
        lease.workerEpoch,
        this.createRunnerId(),
        this.options.includeScheduled === true,
      );
    } catch {
      // Ein verlorener Claim kann bereits eine Sitzung reserviert haben. Recovery gehört zum Neustart.
      this.loseRuntime();
      return;
    }
    if (!scope || !this.checkRuntime()) return;
    try {
      // Ein bereits beanspruchter Auftrag wird auch während eines geordneten Shutdowns bereinigt.
      await this.options.run(scope);
    } catch {
      // Bekannte Fehler schließt der Runner selbst ab. Eine Rejection lässt die Reservierung ungeklärt.
      this.loseRuntime();
    }
  }

  heartbeat(): Promise<boolean> {
    if (!this.checkRuntime()) return Promise.resolve(false);
    this.heartbeating ??= this.renewRuntime().finally(() => {
      this.heartbeating = undefined;
    });
    return this.heartbeating;
  }

  private async renewRuntime(): Promise<boolean> {
    const lease = this.lease;
    if (!lease) return false;
    const renewStartedAt = this.now();
    try {
      const active = await this.options.store.heartbeatWorker(lease.workerId, lease.workerEpoch);
      if (!active || this.lost || renewStartedAt + 90_000 <= this.now()) {
        this.loseRuntime();
        return false;
      }
      // Konservativ ab Anfragebeginn zählen; Transportzeit verlängert keine Serverberechtigung.
      this.lease = Object.freeze({
        ...lease,
        expiresAt: new Date(renewStartedAt + 90_000).toISOString(),
      });
      return true;
    } catch {
      this.loseRuntime();
      return false;
    }
  }

  startMonitoring(): void {
    if (this.stopped || this.heartbeatTimer !== undefined) return;
    if (!this.checkRuntime()) throw new Error('Vinted-Workerberechtigung fehlt');
    this.heartbeatTimer = this.timers.setInterval(() => {
      void this.heartbeat();
    }, 20_000);
  }

  start(): void {
    if (this.stopped || this.started) return;
    this.startMonitoring();
    this.started = true;
    this.pollTimer = this.timers.setInterval(() => {
      void this.poll();
    }, 15_000);
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer !== undefined) this.timers.clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  /** Eine möglicherweise bereits reservierte Sitzung verlangt Recovery vor weiteren Claims. */
  invalidate(): void {
    this.loseRuntime();
  }

  async drain(): Promise<void> {
    this.stop();
    await this.polling;
    if (this.heartbeatTimer !== undefined) this.timers.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    await this.heartbeating;
  }

  release(): Promise<void> {
    this.releasing ??= this.releaseRuntime();
    return this.releasing;
  }

  private async releaseRuntime(): Promise<void> {
    this.stop();
    try {
      await this.initializing;
    } catch {
      // Auch eine abgelehnte Reservierung darf den lokalen Shutdown nicht aufhalten.
    }
    await this.drain();
    const lease = this.lease;
    if (!lease || this.lost) return;
    if (!(await this.options.store.releaseWorker(lease.workerId, lease.workerEpoch)))
      throw new Error('Vinted-Worker kann erst nach Browserbereinigung freigegeben werden');
    this.lease = null;
  }

  private checkRuntime(): boolean {
    if (this.runtimeActive) return true;
    if (this.lease && !this.lost) this.loseRuntime();
    return false;
  }

  private loseRuntime(): void {
    if (this.lost) return;
    this.lost = true;
    this.stop();
    if (this.heartbeatTimer !== undefined) this.timers.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    // Der Callback darf selbst drain() aufrufen, ohne auf seine eigene Promise zu warten.
    try {
      void Promise.resolve(this.options.onRuntimeLost()).catch(() => undefined);
    } catch {
      // Verlorene Berechtigung bleibt unabhängig von der Shutdown-Rückmeldung gesperrt.
    }
  }
}
