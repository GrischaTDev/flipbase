import { Injectable, inject, signal } from '@angular/core';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root',
})
export class PwaService {
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  readonly isInstallable = signal<boolean>(false);
  readonly isInstalled = signal<boolean>(false);
  readonly isOnline = signal<boolean>(
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true,
  );
  readonly swRegistered = signal<boolean>(false);

  private deferredPrompt: any = null;

  constructor() {
    this.initPwaListeners();
    this.registerServiceWorker();
  }

  private initPwaListeners(): void {
    if (typeof window === 'undefined') return;

    // Check if already in standalone mode (installed)
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    ) {
      this.isInstalled.set(true);
    }

    // Capture browser install prompt
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.isInstallable.set(true);
    });

    // Capture successful installation
    window.addEventListener('appinstalled', () => {
      this.isInstalled.set(true);
      this.isInstallable.set(false);
      this.deferredPrompt = null;
    });

    // Online / Offline monitors
    window.addEventListener('online', () => {
      this.isOnline.set(true);
    });

    window.addEventListener('offline', () => {
      this.isOnline.set(false);
    });
  }

  /**
   * Prompts the user to install Flipbase to their home screen or desktop.
   */
  async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) {
      return false;
    }

    try {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        this.isInstalled.set(true);
        this.isInstallable.set(false);
        this.deferredPrompt = null;
        return true;
      }
    } catch (err) {
      this.logger.warn('PWA Install prompt error:', err);
    }
    return false;
  }

  /**
   * Registers the background service worker for asset caching.
   */
  async registerServiceWorker(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      await navigator.serviceWorker.register('/sw.js');
      this.swRegistered.set(true);
    } catch (err) {
      this.logger.warn('ServiceWorker registration error:', err);
    }
  }
}
