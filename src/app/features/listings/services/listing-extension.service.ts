import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { KleinanzeigenListingPayload } from '../models/listing.models';

const EXTENSION_CHECK_MESSAGE = { type: 'FLIPBASE_CHECK_EXTENSION' } as const;

@Injectable({
  providedIn: 'root',
})
export class ListingExtensionService {
  private readonly destroyRef = inject(DestroyRef);
  private started = false;
  private retryTimers: number[] = [];
  private checkTimer: number | null = null;
  private readonly pendingPublishes = new Map<
    string,
    { resolve: (result: { success: boolean; error?: string }) => void; timer: number }
  >();

  readonly available = signal(false);
  readonly checking = signal(false);

  constructor() {
    this.destroyRef.onDestroy(() => this.stop());
  }

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    window.addEventListener('message', this.handleMessage);
    window.addEventListener('flipbase:extension-ready', this.handleReady);
    this.checkNow();
    this.retryTimers = [300, 1_000].map((delay) =>
      window.setTimeout(() => this.postCheck(), delay),
    );
  }

  checkNow(): void {
    this.checking.set(true);
    this.available.set(false);
    this.postCheck();
    if (this.checkTimer !== null) window.clearTimeout(this.checkTimer);
    this.checkTimer = window.setTimeout(() => {
      this.checking.set(false);
      this.checkTimer = null;
    }, 1_250);
  }

  publish(payload: KleinanzeigenListingPayload): Promise<{ success: boolean; error?: string }> {
    if (typeof window === 'undefined' || !this.available()) {
      return Promise.resolve({ success: false, error: 'Die Erweiterung ist nicht verbunden.' });
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.pendingPublishes.delete(requestId);
        resolve({ success: false, error: 'Die Erweiterung hat nicht geantwortet.' });
      }, 10_000);
      this.pendingPublishes.set(requestId, { resolve, timer });
      window.postMessage({ type: 'FLIPBASE_PUBLISH_KLEINANZEIGEN', requestId, payload }, '*');
    });
  }

  private readonly handleMessage = (event: MessageEvent): void => {
    if (event.source !== window || !event.data || typeof event.data !== 'object') return;
    const message = event.data as { readonly type?: unknown; readonly installed?: unknown };
    if (message.type === 'FLIPBASE_PUBLISH_KLEINANZEIGEN_RESULT') {
      const result = event.data as {
        readonly requestId?: unknown;
        readonly success?: unknown;
        readonly error?: unknown;
      };
      const requestId =
        typeof result.requestId === 'string'
          ? result.requestId
          : this.pendingPublishes.size === 1
            ? this.pendingPublishes.keys().next().value
            : undefined;
      if (!requestId) return;
      const pending = this.pendingPublishes.get(requestId);
      if (!pending) return;
      window.clearTimeout(pending.timer);
      this.pendingPublishes.delete(requestId);
      pending.resolve({
        success: result.success === true,
        error: typeof result.error === 'string' ? result.error : undefined,
      });
      return;
    }
    if (
      message.type === 'FLIPBASE_EXTENSION_READY' ||
      (message.type === 'FLIPBASE_EXTENSION_STATUS' && message.installed === true)
    ) {
      this.markAvailable();
    }
  };

  private readonly handleReady = (): void => {
    this.markAvailable();
  };

  private postCheck(): void {
    if (typeof window === 'undefined') return;
    window.postMessage(EXTENSION_CHECK_MESSAGE, '*');
  }

  private markAvailable(): void {
    if (this.checkTimer !== null) window.clearTimeout(this.checkTimer);
    this.checkTimer = null;
    this.available.set(true);
    this.checking.set(false);
  }

  private stop(): void {
    if (typeof window === 'undefined') return;
    for (const timer of this.retryTimers) window.clearTimeout(timer);
    this.retryTimers = [];
    if (this.checkTimer !== null) window.clearTimeout(this.checkTimer);
    this.checkTimer = null;
    for (const pending of this.pendingPublishes.values()) {
      window.clearTimeout(pending.timer);
      pending.resolve({ success: false, error: 'Die Verbindung wurde beendet.' });
    }
    this.pendingPublishes.clear();
    window.removeEventListener('message', this.handleMessage);
    window.removeEventListener('flipbase:extension-ready', this.handleReady);
  }
}
