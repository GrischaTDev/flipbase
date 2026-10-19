import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { ChildrenOutletContexts } from '@angular/router';
import { WorkspaceContextLockService } from './workspace-context-lock.service';
import { hasOpenEntry } from '../../shared/guards/unsaved-entry.guard';

type UpdateResult = 'applied' | 'blocked' | 'failed';
interface UpdateBarrier {
  attemptId: string;
  buildId: string;
  worker: ServiceWorker;
}

@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly contextLock = inject(WorkspaceContextLockService);
  private readonly contexts = inject(ChildrenOutletContexts, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  readonly updateAvailable = signal(false);
  readonly isApplying = signal(false);
  readonly message = signal('');
  readonly availableVersion = signal('');
  readonly checkingForUpdate = signal(false);
  readonly checkError = signal('');
  private registration: ServiceWorkerRegistration | null = null;
  private targetBuild = '';
  private activeBuild = '';
  private targetVersion = '';
  private activeVersion = '';
  private reloading = false;
  private targetWorker: ServiceWorker | null = null;
  private readonly synchronizedWorkers = new WeakSet<ServiceWorker>();
  private activationAttemptId = '';
  private barrier: UpdateBarrier | null = null;
  private completion: ((result: UpdateResult) => void) | null = null;
  private initiator = false;
  private lastUpdateCheck = 0;
  private hiddenSince: number | null = null;
  private checkInFlight: Promise<void> | null = null;
  private checkAbort: AbortController | null = null;
  private registrationRecovery: (() => Promise<void>) | null = null;
  private readonly entryRevision = signal(0);
  private lastSynchronizationProbe = 0;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const receive = (event: MessageEvent) => this.receiveMessage(event);
      const changed = () => {
        this.activeBuild = '';
        if (this.initiator && this.barrier) {
          // Ein veralteter waiting-Verweis oder verspätete Statusantworten dürfen
          // den bereits übernommenen Bau während des Neuladens nicht erneut anbieten.
          this.reloading = true;
          this.updateAvailable.set(false);
          this.complete('applied');
          this.releaseBarrier(true);
          window.location.reload();
        } else {
          this.releaseBarrier();
          this.inspectWaitingWorker();
        }
      };
      navigator.serviceWorker.addEventListener('message', receive);
      navigator.serviceWorker.addEventListener('controllerchange', changed);
      const focused = () => void this.checkForUpdate({ force: true });
      const restored = () => this.resume();
      window.addEventListener('focus', focused);
      window.addEventListener('online', focused);
      window.addEventListener('pageshow', restored);
      const updateTimer = setInterval(() => {
        if (document.visibilityState === 'visible' && navigator.onLine) void this.checkForUpdate();
      }, 60_000);
      // Ältere Formulare ohne Routenschutz während eines Updatehinweises mitprüfen.
      const entryTimer = setInterval(() => {
        const waitingIsCurrent =
          !!this.targetBuild &&
          this.targetBuild === document.documentElement.dataset['flipbaseBuild'] &&
          this.registration?.waiting === this.targetWorker;
        if (this.updateAvailable() || this.checkingForUpdate() || waitingIsCurrent)
          this.entryRevision.update((value) => value + 1);
        // Eine kurz beschäftigte Ansicht darf die Übernahme ihres bereits
        // geladenen Baus nicht bis zum nächsten Fokuswechsel liegenlassen.
        if (
          waitingIsCurrent &&
          !this.reloading &&
          !this.isApplying() &&
          this.isSafe() &&
          Date.now() - this.lastSynchronizationProbe >= 5000
        ) {
          this.lastSynchronizationProbe = Date.now();
          this.inspectWaitingWorker();
        }
      }, 500);
      this.destroyRef.onDestroy(() => {
        navigator.serviceWorker.removeEventListener('message', receive);
        navigator.serviceWorker.removeEventListener('controllerchange', changed);
        window.removeEventListener('focus', focused);
        window.removeEventListener('online', focused);
        window.removeEventListener('pageshow', restored);
        clearInterval(updateTimer);
        clearInterval(entryTimer);
      });
    }
    if (typeof document !== 'undefined') {
      const preventEdit = (event: Event) => {
        if (!this.barrier) return;
        // Zwischen Zustimmung und Aktivierung darf kein neues Edit beginnen.
        event.preventDefault();
        event.stopImmediatePropagation();
        this.revokeBarrier();
      };
      const edits = ['beforeinput', 'pointerdown', 'keydown', 'click', 'submit'];
      for (const name of edits) document.addEventListener(name, preventEdit, true);
      const resume = () => {
        if (document.visibilityState === 'hidden') this.hiddenSince = Date.now();
        else this.resume();
      };
      document.addEventListener('visibilitychange', resume);
      this.destroyRef.onDestroy(() => {
        for (const name of edits) document.removeEventListener(name, preventEdit, true);
        document.removeEventListener('visibilitychange', resume);
      });
    }
    effect(() => {
      if (this.contextLock.locked() && this.barrier) this.revokeBarrier();
    });
    this.destroyRef.onDestroy(() => {
      this.checkAbort?.abort();
      this.complete('failed');
      this.releaseBarrier();
    });
  }

  connect(registration: ServiceWorkerRegistration): void {
    if (this.registration === registration) return;
    this.registration = registration;
    const inspect = () => this.inspectWaitingWorker();
    const found = () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', inspect);
      this.destroyRef.onDestroy(() => installing.removeEventListener('statechange', inspect));
    };
    registration.addEventListener('updatefound', found);
    this.destroyRef.onDestroy(() => registration.removeEventListener('updatefound', found));
    found();
    inspect();
    void this.checkForUpdate({ force: true, showScreen: true });
  }

  setRegistrationRecovery(recover: () => Promise<void>): void {
    this.registrationRecovery = recover;
  }

  reportRegistrationFailure(): void {
    this.checkError.set(
      'Der Update-Dienst konnte nicht gestartet werden. Bitte prüfe Deine Verbindung und versuche es erneut.',
    );
  }

  private inspectWaitingWorker(): void {
    if (this.reloading) return;
    const waiting = this.registration?.waiting ?? null;
    if (waiting !== this.targetWorker) {
      this.targetWorker = waiting;
      this.targetBuild = '';
      this.targetVersion = '';
      this.refreshOffer();
      this.message.set('');
    }
    this.queryWorker(waiting, 'PWA_UPDATE_QUERY');
    this.queryWorker(navigator.serviceWorker?.controller, 'PWA_ACTIVE_QUERY');
  }

  private queryWorker(worker: ServiceWorker | null | undefined, type: string): void {
    try {
      worker?.postMessage({ type });
    } catch {
      // Ein nach der Hintergrundpause beendeter Worker darf die anschließende
      // Netzwerkprüfung nicht abbrechen. Deren Fehler erhält einen sichtbaren Hinweis.
    }
  }

  private refreshOffer(): void {
    const waitingUpdate = this.isDifferentBuild(this.targetBuild);
    // Eine bereits aktuelle HTML-Ansicht übernimmt nur ihren eigenen Worker.
    // Dessen alter Controller ist während dieser Übergabe keine neue Version.
    const waitingIsCurrent =
      !!this.targetBuild && this.targetBuild === document.documentElement.dataset['flipbaseBuild'];
    const activeUpdate = !waitingIsCurrent && this.isDifferentBuild(this.activeBuild);
    this.updateAvailable.set(!this.reloading && (waitingUpdate || activeUpdate));
    this.availableVersion.set(
      waitingUpdate ? this.targetVersion : activeUpdate ? this.activeVersion : '',
    );
  }

  private readVersion(value: unknown): string {
    return typeof value === 'string' &&
      value.length <= 80 &&
      /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(value)
      ? value
      : '';
  }

  private isDifferentBuild(buildId: string): boolean {
    return (
      /^[a-f0-9]{64}$/.test(buildId) &&
      buildId !== document.documentElement.dataset['flipbaseBuild']
    );
  }

  hasOpenChanges(): boolean {
    this.entryRevision();
    return (
      this.contextLock.locked() ||
      hasOpenEntry(this.contexts) ||
      Array.from(
        document.querySelectorAll(
          '.ng-dirty, .ng-pending, [aria-busy="true"], [appModalDialog], dialog[open]',
        ),
      ).some((element) => !element.closest('[data-pwa-update-screen]'))
    );
  }

  private isSafe(): boolean {
    return !this.hasOpenChanges();
  }

  private resume(): void {
    const showScreen = this.hiddenSince !== null && Date.now() - this.hiddenSince >= 60_000;
    this.hiddenSince = null;
    void this.checkForUpdate({ force: true, showScreen });
  }

  checkForUpdate(options: { force?: boolean; showScreen?: boolean } = {}): Promise<void> {
    this.inspectWaitingWorker();
    if (this.checkInFlight) {
      if (options.showScreen) this.checkingForUpdate.set(true);
      return this.checkInFlight;
    }
    const now = Date.now();
    if (
      (!this.registration && !this.registrationRecovery) ||
      (!options.force && now - this.lastUpdateCheck < 60_000)
    )
      return Promise.resolve();
    if (!navigator.onLine) {
      this.checkError.set(
        'Du bist offline. Die Updateprüfung startet wieder, sobald Du online bist.',
      );
      return Promise.resolve();
    }
    this.lastUpdateCheck = now;
    this.checkError.set('');
    this.checkingForUpdate.set(options.showScreen === true);
    const abort = new AbortController();
    this.checkAbort = abort;
    // update() und die anschließende Installation können bei pausierten Seiten
    // hängen. Nur die Anzeige begrenzen; eine spätere fertige Version bleibt erkennbar.
    let timeout: ReturnType<typeof setTimeout>;
    const limit = new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Updateprüfung ohne Antwort')), 8000);
      abort.signal.addEventListener('abort', () => resolve(), { once: true });
    });
    const inspect = async () => {
      if (!this.registration) await this.registrationRecovery?.();
      if (abort.signal.aborted) return;
      if (!this.registration) throw new Error('Update-Dienst nicht erreichbar');
      // Nach einer Wiederherstellung den aktuellen Browser-Verweis verwenden.
      const current = options.force
        ? await navigator.serviceWorker.getRegistration?.('/')
        : undefined;
      if (abort.signal.aborted) return;
      if (current && current !== this.registration) this.connect(current);
      const registration = this.registration!;
      await registration.update();
      if (abort.signal.aborted) return;
      const installing = registration.installing;
      if (installing && installing.state !== 'installed' && installing.state !== 'redundant') {
        await new Promise<void>((resolve) => {
          const changed = () => {
            if (installing.state === 'installed' || installing.state === 'redundant') resolve();
          };
          installing.addEventListener('statechange', changed, { signal: abort.signal });
          abort.signal.addEventListener('abort', () => resolve(), { once: true });
          changed();
        });
      }
      if (!abort.signal.aborted) this.inspectWaitingWorker();
    };
    this.checkInFlight = Promise.race([inspect(), limit])
      .catch(() => {
        this.checkError.set(
          'Die Updateprüfung konnte nicht abgeschlossen werden. Bitte versuche es erneut.',
        );
      })
      .finally(() => {
        clearTimeout(timeout);
        abort.abort();
        this.checkAbort = null;
        this.checkingForUpdate.set(false);
        this.checkInFlight = null;
      });
    return this.checkInFlight;
  }

  async applyUpdate(): Promise<UpdateResult> {
    if (this.reloading) return 'blocked';
    if (!this.isSafe()) {
      this.message.set('Speichere oder verwerfe zuerst deine offenen Änderungen.');
      return 'blocked';
    }
    const waiting = this.registration?.waiting;
    if (this.completion) return 'blocked';
    // Andere Tabs können den Worker bereits aktiviert haben. Dieses Dokument
    // darf erst nach seiner eigenen Eingabeprüfung auf den neuen Bau wechseln.
    if (!waiting && this.isDifferentBuild(this.activeBuild)) {
      this.reloading = true;
      this.updateAvailable.set(false);
      this.isApplying.set(true);
      window.location.reload();
      return 'applied';
    }
    if (!waiting || waiting !== this.targetWorker || !/^[a-f0-9]{64}$/.test(this.targetBuild)) {
      this.inspectWaitingWorker();
      this.message.set('Die Aktualisierung wird noch vorbereitet. Bitte versuche es erneut.');
      return 'failed';
    }
    this.initiator = true;
    this.activationAttemptId = crypto.randomUUID();
    this.isApplying.set(true);
    this.message.set('Offene Ansichten werden geprüft …');
    return new Promise((resolve) => {
      this.completion = resolve;
      this.releaseTimer = setTimeout(() => {
        this.revokeBarrier();
        this.message.set('Die Aktualisierung hat nicht geantwortet. Bitte versuche es erneut.');
        this.complete('failed');
        this.releaseBarrier();
      }, 8000);
      waiting.postMessage({
        type: 'ACTIVATE_UPDATE',
        buildId: this.targetBuild,
        attemptId: this.activationAttemptId,
      });
    });
  }

  private receiveMessage(event: MessageEvent): void {
    if (this.reloading) return;
    const payload: unknown = event.data;
    if (!payload || typeof payload !== 'object') return;
    const message = payload as Record<string, unknown>;
    if (
      message['type'] === 'PWA_ACTIVE_STATUS' &&
      navigator.serviceWorker.controller &&
      event.source === navigator.serviceWorker.controller &&
      typeof message['buildId'] === 'string' &&
      /^[a-f0-9]{64}$/.test(message['buildId'])
    ) {
      this.activeBuild = message['buildId'];
      this.activeVersion = this.readVersion(message['version']);
      this.refreshOffer();
      return;
    }
    const worker = this.barrier?.worker ?? this.registration?.waiting;
    if (!worker || event.source !== worker || typeof message['buildId'] !== 'string') return;
    if (message['type'] === 'PWA_WAITING_STATUS') {
      if (!/^[a-f0-9]{64}$/.test(message['buildId'])) return;
      this.targetBuild = message['buildId'];
      this.targetVersion = this.readVersion(message['version']);
      const isCurrentBuild = this.targetBuild === document.documentElement.dataset['flipbaseBuild'];
      this.refreshOffer();
      // Der bisherige Netzwerk-Worker kann bereits diese HTML-Version geladen haben.
      // Nur nach derselben Eingabeprüfung übernehmen; andere Fenster dürfen weiterhin blockieren.
      if (isCurrentBuild && !this.synchronizedWorkers.has(worker) && this.isSafe()) {
        this.synchronizedWorkers.add(worker);
        void this.applyUpdate().then((result) => {
          if (result !== 'applied') this.synchronizedWorkers.delete(worker);
        });
      }
      return;
    }
    if (typeof message['attemptId'] !== 'string') return;
    const attemptId = message['attemptId'];
    const buildId = message['buildId'];
    if (message['type'] === 'PWA_PREPARE_UPDATE') {
      const clientBuildId = document.documentElement.dataset['flipbaseBuild'] ?? '';
      const safe = this.isSafe() && /^[a-f0-9]{64}$/.test(clientBuildId);
      if (safe) {
        this.barrier = { attemptId, buildId, worker };
        this.isApplying.set(true);
        if (!this.releaseTimer)
          this.releaseTimer = setTimeout(() => {
            this.revokeBarrier();
            this.complete('failed');
            this.releaseBarrier();
          }, 8000);
      }
      worker.postMessage({ type: 'PWA_UPDATE_ACK', buildId, attemptId, clientBuildId, safe });
    } else if (this.barrier?.attemptId === attemptId && this.barrier.buildId === buildId) {
      if (message['type'] === 'PWA_COMMIT_UPDATE')
        worker.postMessage({
          type: 'PWA_UPDATE_COMMIT_ACK',
          buildId,
          attemptId,
          clientBuildId: document.documentElement.dataset['flipbaseBuild'],
          safe: this.isSafe(),
        });
      if (message['type'] === 'PWA_UPDATE_RESULT' && message['result'] !== 'applied') {
        this.message.set(
          'Speichere deine Eingaben und schließe andere Flipbase-Tabs oder App-Fenster. Versuche es dann erneut.',
        );
        this.complete('blocked');
        this.releaseBarrier();
      }
    } else if (
      message['type'] === 'PWA_UPDATE_RESULT' &&
      this.initiator &&
      attemptId === this.activationAttemptId &&
      buildId === this.targetBuild &&
      message['result'] !== 'applied'
    ) {
      this.message.set(
        'Speichere deine Eingaben und schließe andere Flipbase-Tabs oder App-Fenster. Versuche es dann erneut.',
      );
      this.complete('blocked');
      this.releaseBarrier();
    }
  }

  private revokeBarrier(): void {
    if (this.barrier)
      this.barrier.worker.postMessage({
        type: 'PWA_UPDATE_REVOKE',
        attemptId: this.barrier.attemptId,
        buildId: this.barrier.buildId,
      });
  }
  private complete(result: UpdateResult): void {
    this.completion?.(result);
    this.completion = null;
  }
  private releaseBarrier(keepApplying = false): void {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    this.barrier = null;
    this.initiator = false;
    this.activationAttemptId = '';
    this.isApplying.set(keepApplying);
  }
}
