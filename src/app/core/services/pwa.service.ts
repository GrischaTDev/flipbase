import { Injectable, inject, signal } from '@angular/core';
import { LoggerService } from './logger.service';
import { environment } from '../../../environments/environment';

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
   * Registriert den Service Worker, der die Anwendungsdateien zwischenspeichert.
   *
   * **Nur im Produktionsbetrieb.** Der Service Worker liefert Skripte nach dem
   * Muster "erst Cache, dann im Hintergrund auffrischen" aus (`public/sw.js`).
   * In der Produktion ist das unproblematisch, weil jede Fassung neue
   * Dateinamen mit Prüfsumme bekommt – die stehen nicht im Cache und werden
   * geladen.
   *
   * In der Entwicklung haben die Dateien dagegen **feste Namen**. Der Cache
   * traf also immer, und jede Änderung erschien fruehestens beim übernächsten
   * Laden. Das kostete einen ganzen Debug-Nachmittag: Getestet wurde ein
   * Stand, den der Entwicklungsserver längst ersetzt hatte.
   */
  async registerServiceWorker(): Promise<void> {
    if (!environment.production) return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      await navigator.serviceWorker.register('/sw.js');
      this.swRegistered.set(true);
    } catch (err) {
      this.logger.warn('ServiceWorker registration error:', err);
    }
  }
}
