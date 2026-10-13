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
  private registration: ServiceWorkerRegistration | null = null;
  private targetBuild = '';
  private barrier: UpdateBarrier | null = null;
  private completion: ((result: UpdateResult) => void) | null = null;
  private initiator = false;
  private lastUpdateCheck = 0;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const receive = (event: MessageEvent) => this.receiveMessage(event);
      const changed = () => {
        if (this.initiator && this.barrier) {
          this.complete('applied');
          window.location.reload();
        } else this.releaseBarrier();
      };
      navigator.serviceWorker.addEventListener('message', receive);
      navigator.serviceWorker.addEventListener('controllerchange', changed);
      this.destroyRef.onDestroy(() => {
        navigator.serviceWorker.removeEventListener('message', receive);
        navigator.serviceWorker.removeEventListener('controllerchange', changed);
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
        if (document.visibilityState === 'visible') void this.checkForUpdate();
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
      this.complete('failed');
      this.releaseBarrier();
    });
  }

  connect(registration: ServiceWorkerRegistration): void {
    if (this.registration === registration) return;
    this.registration = registration;
    const inspect = () => {
      this.updateAvailable.set(Boolean(registration.waiting));
      registration.waiting?.postMessage({ type: 'PWA_UPDATE_QUERY' });
    };
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
  }

  private isSafe(): boolean {
    return !this.contextLock.locked() && !hasOpenEntry(this.contexts);
  }

  async checkForUpdate(): Promise<void> {
    const now = Date.now();
    if (!this.registration || now - this.lastUpdateCheck < 60_000) return;
    this.lastUpdateCheck = now;
    try {
      await this.registration.update();
    } catch {
      this.message.set('Die Prüfung auf eine neue Version ist gerade nicht möglich.');
    }
  }

  async applyUpdate(): Promise<UpdateResult> {
    if (!this.isSafe()) {
      this.message.set('Speichere oder verwerfe zuerst deine offenen Änderungen.');
      return 'blocked';
    }
    const waiting = this.registration?.waiting;
    if (!waiting || !/^[a-f0-9]{64}$/.test(this.targetBuild) || this.completion) return 'failed';
    this.initiator = true;
    this.isApplying.set(true);
    this.message.set('Offene Ansichten werden geprüft …');
    return new Promise((resolve) => {
      this.completion = resolve;
      this.releaseTimer = setTimeout(() => {
        this.complete('failed');
        this.releaseBarrier();
      }, 8000);
      waiting.postMessage({
        type: 'ACTIVATE_UPDATE',
        buildId: this.targetBuild,
        attemptId: crypto.randomUUID(),
      });
    });
  }

  private receiveMessage(event: MessageEvent): void {
    const payload: unknown = event.data;
    if (!payload || typeof payload !== 'object') return;
    const message = payload as Record<string, unknown>;
    const worker = this.barrier?.worker ?? this.registration?.waiting;
    if (!worker || event.source !== worker || typeof message['buildId'] !== 'string') return;
    if (message['type'] === 'PWA_WAITING_STATUS') {
      this.targetBuild = message['buildId'];
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
          'Speichere oder schließe zuerst offene Eingaben in allen Flipbase-Ansichten.',
        );
        this.complete('blocked');
        this.releaseBarrier();
      }
    } else if (
      message['type'] === 'PWA_UPDATE_RESULT' &&
      this.initiator &&
      message['result'] !== 'applied'
    ) {
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
  private releaseBarrier(): void {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    this.barrier = null;
    this.initiator = false;
    this.isApplying.set(false);
  }
}
