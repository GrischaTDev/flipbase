import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { KleinanzeigenListingPayload } from '../../../core/services/listing-studio.service';

const EXTENSION_CHECK_MESSAGE = { type: 'FLIPBASE_CHECK_EXTENSION' } as const;

@Injectable({
  providedIn: 'root',
})
export class ListingExtensionService {
  private readonly destroyRef = inject(DestroyRef);
  private started = false;
  private retryTimers: number[] = [];

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
    this.updateAvailabilityFromDocument();
    this.postCheck();
  }

  publish(payload: KleinanzeigenListingPayload): void {
    if (typeof window === 'undefined') return;
    window.postMessage({ type: 'FLIPBASE_PUBLISH_KLEINANZEIGEN', payload }, '*');
  }

  private readonly handleMessage = (event: MessageEvent): void => {
    if (event.source !== window || !event.data || typeof event.data !== 'object') return;
    const message = event.data as { readonly type?: unknown; readonly installed?: unknown };
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

  private updateAvailabilityFromDocument(): void {
    if (
      typeof document !== 'undefined' &&
      document.documentElement.dataset['flipbaseExtensionInstalled'] === 'true'
    ) {
      this.markAvailable();
    }
  }

  private markAvailable(): void {
    this.available.set(true);
    this.checking.set(false);
  }

  private stop(): void {
    if (typeof window === 'undefined') return;
    for (const timer of this.retryTimers) window.clearTimeout(timer);
    this.retryTimers = [];
    window.removeEventListener('message', this.handleMessage);
    window.removeEventListener('flipbase:extension-ready', this.handleReady);
  }
}
