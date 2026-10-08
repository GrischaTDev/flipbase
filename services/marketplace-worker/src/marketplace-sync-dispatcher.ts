import { randomUUID } from 'node:crypto';
import type { BrowserSessionScope } from './marketplace-browser-session-broker.ts';
import type {
  CloudMessageClaim,
  MarketplaceCloudWriteDispatch,
} from './marketplace-message-runner.ts';

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
interface DispatcherOptions<Job> {
  writes?: MarketplaceCloudWriteDispatch<Job>;
  store: MarketplaceSyncDispatchStore;
  run(scope: BrowserSessionScope): Promise<void>;
  onRuntimeLost(reason: MarketplaceRuntimeLossReason): void | Promise<void>;
  includeScheduled?: boolean;
  maxJobsPerPoll?: number;
  workerId?: string;
  createRunnerId?: () => string;
  timers?: MarketplaceSyncTimers;
  now?: () => number;
}
export type MarketplaceRuntimeLossReason =
  | 'claim_failed'
  | 'run_failed'
  | 'heartbeat_rejected'
  | 'heartbeat_expired'
  | 'heartbeat_failed'
  | 'runtime_expired'
  | 'reservation_uncertain';
export class MarketplaceSyncDispatcher<Job = CloudMessageClaim> {
  private readonly options: DispatcherOptions<Job>;
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

  constructor(options: DispatcherOptions<Job>) {
    if (
      options.maxJobsPerPoll !== undefined &&
      (!Number.isInteger(options.maxJobsPerPoll) ||
        options.maxJobsPerPoll < 1 ||
        options.maxJobsPerPoll > 128)
    )
      throw new Error('Ungültige Anzahl von Abrufen je Warteschlangenprüfung');
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
    const running = this.drainAvailableJobs();
    this.polling = running;
    try {
      await running;
    } finally {
      this.polling = undefined;
    }
  }

  private async drainAvailableJobs(): Promise<void> {
    // Erst nach bestätigtem Abschluss folgt das nächste Konto; kein zusätzlicher Timer-Leerlauf.
    for (let index = 0; index < (this.options.maxJobsPerPoll ?? 1); index++) {
      if (this.stopped || !this.checkRuntime() || !(await this.claimAndRun())) return;
    }
  }

  private async claimAndRun(): Promise<boolean> {
    const lease = this.lease;
    if (!lease) return false;
    let scope: BrowserSessionScope | null;
    try {
      const runnerId = this.createRunnerId();
      if (this.options.writes) {
        const job = await this.options.writes.claim(lease.workerId, lease.workerEpoch, runnerId);
        if (job) {
          if (!this.checkRuntime()) return false;
          try {
            await this.options.writes.run(job);
          } catch {
            this.loseRuntime('run_failed');
            return false;
          }
          return true;
        }
        if (!this.checkRuntime()) return false;
      }
      scope = await this.options.store.claim(
        lease.workerId,
        lease.workerEpoch,
        runnerId,
        this.options.includeScheduled === true,
      );
    } catch {
      // Ein verlorener Claim kann bereits eine Sitzung reserviert haben. Recovery gehört zum Neustart.
      this.loseRuntime('claim_failed');
      return false;
    }
    if (!scope || !this.checkRuntime()) return false;
    try {
      // Ein bereits beanspruchter Auftrag wird auch während eines geordneten Shutdowns bereinigt.
      await this.options.run(scope);
    } catch {
      // Bekannte Fehler schließt der Runner selbst ab. Eine Rejection lässt die Reservierung ungeklärt.
      this.loseRuntime('run_failed');
      return false;
    }
    return true;
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
        this.loseRuntime(active ? 'heartbeat_expired' : 'heartbeat_rejected');
        return false;
      }
      // Konservativ ab Anfragebeginn zählen; Transportzeit verlängert keine Serverberechtigung.
      this.lease = Object.freeze({
        ...lease,
        expiresAt: new Date(renewStartedAt + 90_000).toISOString(),
      });
      return true;
    } catch {
      this.loseRuntime('heartbeat_failed');
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
    this.loseRuntime('reservation_uncertain');
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
    if (this.lease && !this.lost) this.loseRuntime('runtime_expired');
    return false;
  }

  private loseRuntime(reason: MarketplaceRuntimeLossReason): void {
    if (this.lost) return;
    this.lost = true;
    this.stop();
    if (this.heartbeatTimer !== undefined) this.timers.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    // Der Callback darf selbst drain() aufrufen, ohne auf seine eigene Promise zu warten.
    try {
      void Promise.resolve(this.options.onRuntimeLost(reason)).catch(() => undefined);
    } catch {
      // Verlorene Berechtigung bleibt unabhängig von der Shutdown-Rückmeldung gesperrt.
    }
  }
}
