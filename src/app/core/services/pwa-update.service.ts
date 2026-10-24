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
  readonly startupPending = signal(!!document.getElementById('app-startup'));
  readonly updateAvailable = signal(false);
  readonly isApplying = signal(false);
  readonly message = signal('');
  readonly availableVersion = signal('');
  readonly checkingForUpdate = signal(false);
  readonly checkError = signal('');
  private registration: ServiceWorkerRegistration | null = null;
  private targetBuild = '';
  private activeBuild = '';
  private activeStatusKnown = false;
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
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private autoReloaded = false;
  private checkInFlight: Promise<void> | null = null;
  private checkAbort: AbortController | null = null;
  private registrationRecovery: (() => Promise<void>) | null = null;
  private readonly entryRevision = signal(0);
  private lastSynchronizationProbe = 0;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly editedControls = new Map<HTMLElement, string>();

  constructor() {
    if (this.startupPending()) {
      // Nach höchstens drei Sekunden die vorhandene lauffähige Version freigeben.
      // Ein bereits verbindlich begonnener Wechsel behält dagegen seine Ansicht.
      this.startupTimer = setTimeout(() => {
        if (!this.isApplying()) this.finishStartup();
      }, 3000);
      this.destroyRef.onDestroy(() => {
        if (this.startupTimer) clearTimeout(this.startupTimer);
      });
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const receive = (event: MessageEvent) => {
        try {
          this.receiveMessage(event);
        } catch {
          this.message.set('Der Update-Dienst wurde unterbrochen. Bitte versuche es erneut.');
          this.complete('failed');
          this.releaseBarrier();
          this.finishStartup();
        }
      };
      const changed = () => {
        this.activeBuild = '';
        this.activeStatusKnown = false;
        if (this.initiator && this.barrier) {
          this.queryWorker(navigator.serviceWorker.controller, 'PWA_ACTIVE_QUERY');
        } else {
          this.releaseBarrier();
          this.bindDocument();
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
      const trackEntry = (event: Event) => {
        const element = event.target;
        if (!(element instanceof HTMLElement) || element.closest('[data-pwa-update-screen]'))
          return;
        const angularControl = element.closest('.ng-pristine, .ng-dirty, .ng-pending');
        if (
          angularControl &&
          (angularControl === element || angularControl.tagName.startsWith('APP-'))
        )
          return;
        const value = this.controlValue(element);
        if (value === null) return;
        if (!this.editedControls.has(element)) {
          const original =
            event.type === 'focusin'
              ? value
              : element instanceof HTMLInputElement
                ? ['checkbox', 'radio'].includes(element.type)
                  ? String(element.defaultChecked)
                  : element.defaultValue
                : element instanceof HTMLTextAreaElement
                  ? element.defaultValue
                  : '';
          this.editedControls.set(element, original);
        }
        this.entryRevision.update((revision) => revision + 1);
      };
      for (const name of ['focusin', 'input', 'change'])
        document.addEventListener(name, trackEntry, true);
      this.destroyRef.onDestroy(() => {
        for (const name of ['focusin', 'input', 'change'])
          document.removeEventListener(name, trackEntry, true);
        this.editedControls.clear();
      });
      const preventEdit = (event: Event) => {
        if (!this.barrier) return;
        // Zwischen Zustimmung und Aktivierung darf kein neues Edit beginnen.
        event.preventDefault();
        event.stopImmediatePropagation();
        // Die Updatefläche enthält keine Eingaben. Weitere Berührungen bleiben
        // gesperrt, dürfen die laufende Aktualisierung aber nicht widerrufen.
        if (
          ['pointerdown', 'click', 'keydown'].includes(event.type) &&
          event.target instanceof Element &&
          event.target.closest('[data-pwa-update-screen]')
        )
          return;
        this.revokeBarrier();
      };
      const edits = ['beforeinput', 'pointerdown', 'keydown', 'click', 'submit'];
      for (const name of edits) document.addEventListener(name, preventEdit, true);
      const resume = () => {
        if (document.visibilityState === 'visible') this.resume();
      };
      document.addEventListener('visibilitychange', resume);
      this.destroyRef.onDestroy(() => {
        for (const name of edits) document.removeEventListener(name, preventEdit, true);
        document.removeEventListener('visibilitychange', resume);
      });
    }
    effect(() => {
      const safe = this.isSafe();
      if (!safe && this.barrier) this.revokeBarrier();
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
    void this.checkForUpdate({ force: true });
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
    if (this.initiator && this.barrier) {
      this.queryWorker(navigator.serviceWorker?.controller, 'PWA_ACTIVE_QUERY');
      return;
    }
    const waiting = this.registration?.waiting ?? null;
    if (waiting !== this.targetWorker) {
      this.targetWorker = waiting;
      this.targetBuild = '';
      this.targetVersion = '';
      this.refreshOffer();
      this.message.set('');
    }
    this.queryWorker(waiting, 'PWA_UPDATE_QUERY');
    this.bindDocument();
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
    let changedControl = false;
    for (const [element, original] of this.editedControls) {
      if (!element.isConnected) this.editedControls.delete(element);
      else if (this.controlValue(element) !== original) changedControl = true;
    }
    let hasEntryState = false;
    let contexts = this.contexts;
    while (contexts) {
      const context = contexts.getContext('primary');
      if (!context) break;
      if (context.outlet?.isActivated) {
        const component = context.outlet.component as {
          hasUnsavedChanges?: unknown;
          isSaving?: unknown;
        };
        if (
          typeof component.hasUnsavedChanges === 'function' &&
          typeof component.isSaving === 'function'
        )
          hasEntryState = true;
      }
      contexts = context.children;
    }
    return (
      (hasEntryState
        ? (this.contextLock.operationLocked?.() ?? this.contextLock.locked())
        : this.contextLock.locked()) ||
      hasOpenEntry(this.contexts) ||
      changedControl ||
      Array.from(
        document.querySelectorAll(
          '.ng-dirty, .ng-pending, [aria-busy="true"], [data-update-draft="true"], [data-update-unsaved="true"]',
        ),
      ).some((element) => !element.closest('[data-pwa-update-screen]'))
    );
  }

  private controlValue(element: HTMLElement): string | null {
    if (element instanceof HTMLInputElement) {
      if (['button', 'submit', 'reset', 'hidden', 'search'].includes(element.type)) return null;
      return ['checkbox', 'radio'].includes(element.type) ? String(element.checked) : element.value;
    }
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
      return element.value;
    return element.isContentEditable ? (element.textContent ?? '') : null;
  }

  private isSafe(): boolean {
    return !this.hasOpenChanges();
  }

  private resume(): void {
    void this.checkForUpdate({ force: true });
  }

  private bindDocument(): void {
    const clientBuildId = document.documentElement.dataset['flipbaseBuild'];
    if (!/^[a-f0-9]{64}$/.test(clientBuildId ?? '')) return;
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: 'PWA_BIND_CLIENT', clientBuildId });
    } catch {
      // Ein beendeter Worker wird bei der nächsten Rückkehr neu angesprochen.
    }
  }

  finishStartup(): void {
    if (!this.startupPending()) return;
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = null;
    this.startupPending.set(false);
    try {
      if (
        sessionStorage.getItem('flipbase_update_target') ===
        document.documentElement.dataset['flipbaseBuild']
      )
        sessionStorage.removeItem('flipbase_update_target');
    } catch {
      // Die Startfreigabe benötigt keinen schreibbaren Browserspeicher.
    }
    window.dispatchEvent(new Event('flipbase:updates-ready'));
  }

  private settleStartup(): void {
    if (!this.startupPending() || this.isApplying()) return;
    if (!this.isSafe()) return this.finishStartup();
    if (this.targetBuild && this.isDifferentBuild(this.targetBuild)) {
      if (!this.reserveAutomaticReload(this.targetBuild)) return this.finishStartup();
      window.dispatchEvent(new Event('flipbase:startup-updating'));
      void this.applyUpdate().then((result) => {
        if (result !== 'applied') this.finishStartup();
      });
    } else if (
      !this.registration?.waiting &&
      !this.registration?.installing &&
      !this.checkInFlight &&
      !this.checkingForUpdate() &&
      (!navigator.serviceWorker?.controller || this.activeStatusKnown)
    ) {
      if (
        this.isDifferentBuild(this.activeBuild) &&
        this.reserveAutomaticReload(this.activeBuild)
      ) {
        window.dispatchEvent(new Event('flipbase:startup-updating'));
        void this.applyUpdate();
      } else {
        this.finishStartup();
      }
    }
  }

  private reserveAutomaticReload(build: string): boolean {
    if (this.autoReloaded) return false;
    this.autoReloaded = true;
    try {
      const previous = sessionStorage.getItem('flipbase_update_target');
      if (previous) {
        // Ein automatischer Versuch wird erst nach einem erfolgreichen Start
        // freigegeben, nicht durch eine weitere Antwort desselben Workers.
        return false;
      }
      sessionStorage.setItem('flipbase_update_target', build);
      return true;
    } catch {
      return false;
    }
  }

  private finishHandover(): void {
    const target = this.barrier?.buildId ?? this.targetBuild;
    const sameBuild = target === document.documentElement.dataset['flipbaseBuild'];
    this.complete('applied');
    this.releaseBarrier(!sameBuild);
    if (sameBuild) {
      this.bindDocument();
      this.finishStartup();
      return;
    }
    this.reloading = true;
    this.updateAvailable.set(false);
    try {
      sessionStorage.setItem('flipbase_update_target', target);
    } catch {
      /* Kein automatischer weiterer Versuch. */
    }
    window.location.reload();
  }

  checkForUpdate(options: { force?: boolean; showScreen?: boolean } = {}): Promise<void> {
    this.inspectWaitingWorker();
    if (this.checkInFlight) {
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
    this.checkingForUpdate.set(true);
    const abort = new AbortController();
    this.checkAbort = abort;
    // Nur die Netzwerkprüfung begrenzen. Die anschließende Installation kann
    // mobil länger dauern und wird unabhängig über updatefound/statechange erkannt.
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
        this.settleStartup();
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
      try {
        sessionStorage.setItem('flipbase_update_target', this.activeBuild);
      } catch {
        /* Nur manuell neu laden. */
      }
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
    this.message.set('Deine neue Version wird geöffnet …');
    if (this.startupTimer) clearTimeout(this.startupTimer);
    return new Promise((resolve) => {
      this.completion = resolve;
      this.releaseTimer = setTimeout(() => {
        this.revokeBarrier();
        this.message.set('Die Aktualisierung hat nicht geantwortet. Bitte versuche es erneut.');
        this.complete('failed');
        this.releaseBarrier();
      }, 8000);
      try {
        waiting.postMessage({
          type: 'ACTIVATE_UPDATE',
          buildId: this.targetBuild,
          attemptId: this.activationAttemptId,
        });
      } catch {
        this.message.set('Der Update-Dienst wurde unterbrochen. Bitte versuche es erneut.');
        this.complete('failed');
        this.releaseBarrier();
        this.finishStartup();
      }
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
      this.activeStatusKnown = true;
      this.activeVersion = this.readVersion(message['version']);
      if (this.initiator && this.barrier && this.activeBuild === this.barrier.buildId) {
        if (this.isSafe()) this.finishHandover();
        else {
          this.complete('blocked');
          this.releaseBarrier();
          this.finishStartup();
        }
        return;
      }
      this.refreshOffer();
      this.settleStartup();
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
      this.settleStartup();
      // Der bisherige Netzwerk-Worker kann bereits diese HTML-Version geladen haben.
      // Nur die Eingaben dieses Dokuments prüfen; andere Fenster behalten ihren Bau.
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
      // Fremde beziehungsweise alte globale Versuche dürfen dieses Dokument
      // niemals sperren. Nur der eigene bewusste Wechsel bestätigt Eingabesicherheit.
      if (!this.initiator || attemptId !== this.activationAttemptId) {
        worker.postMessage({
          type: 'PWA_UPDATE_ACK',
          buildId,
          attemptId,
          clientBuildId: document.documentElement.dataset['flipbaseBuild'],
          safe: this.isSafe(),
        });
        return;
      }
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
          message['reason'] === 'storage'
            ? 'Die App-Dateien konnten nicht sicher zugeordnet werden. Bitte versuche es erneut.'
            : 'Der Versionswechsel konnte nicht abgeschlossen werden. Bitte versuche es erneut.',
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
        message['reason'] === 'storage'
          ? 'Die App-Dateien konnten nicht sicher zugeordnet werden. Bitte versuche es erneut.'
          : 'Der Versionswechsel konnte nicht abgeschlossen werden. Bitte versuche es erneut.',
      );
      this.complete('blocked');
      this.releaseBarrier();
    }
  }

  private revokeBarrier(): void {
    try {
      if (this.barrier)
        this.barrier.worker.postMessage({
          type: 'PWA_UPDATE_REVOKE',
          attemptId: this.barrier.attemptId,
          buildId: this.barrier.buildId,
        });
    } catch {
      // Ein beendeter Worker darf das anschließende Aufräumen nicht verhindern.
    }
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
