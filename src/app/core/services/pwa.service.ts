import { computed, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { LoggerService } from './logger.service';
import { environment } from '../../../environments/environment';
import { PwaUpdateService } from './pwa-update.service';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}
interface NavigatorWithStandalone extends Navigator {
  readonly standalone?: boolean;
}
export type PwaInstallState = 'standalone' | 'prompt_available' | 'manual' | 'unsupported';

@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly destroyRef = inject(DestroyRef);
  private readonly updates = inject(PwaUpdateService, { optional: true });
  readonly isStandalone = signal(false);
  readonly installationConfirmed = signal(this.readInstallationConfirmation());
  readonly isInstalled = computed(() => this.isStandalone() || this.installationConfirmed());
  readonly installDialogOpen = signal(false);
  readonly isInstalling = signal(false);
  readonly installMessage = signal('');
  readonly isInstallable = signal(false);
  readonly isMobileDevice = signal(
    typeof navigator !== 'undefined' &&
      (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)),
  );
  readonly showInstallationOffer = computed(() => this.isMobileDevice() && !this.isInstalled());
  readonly isOnline = signal(
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true,
  );
  readonly swRegistered = signal(false);
  readonly offlineAssetsReady = signal(false);
  readonly updateAvailable = this.updates?.updateAvailable ?? signal(false);
  readonly installState = computed<PwaInstallState>(() => {
    if (this.isStandalone()) return 'standalone';
    if (!this.isMobileDevice()) return 'unsupported';
    if (this.isInstallable()) return 'prompt_available';
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? 'manual'
      : 'unsupported';
  });
  readonly installationHelp = computed(() => {
    const isApple =
      typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
    return isApple
      ? 'Öffne Flipbase in Safari. Wähle im Teilen-Menü "Zum Home-Bildschirm" und bestätige mit "Hinzufügen".'
      : 'Öffne Flipbase in Chrome oder einem anderen Browser mit App-Installation. Wähle im Browser-Menü "App installieren" oder "Zum Startbildschirm hinzufügen", falls angeboten. Öffne die Seite dafür direkt im Browser statt in einer anderen App.';
  });
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const media = window.matchMedia('(display-mode: standalone)');
      const updateMode = () => {
        this.isStandalone.set(
          media.matches || (navigator as NavigatorWithStandalone).standalone === true,
        );
        if (this.isStandalone()) this.confirmInstallation();
      };
      updateMode();
      media.addEventListener('change', updateMode);
      this.destroyRef.onDestroy(() => media.removeEventListener('change', updateMode));
      this.listen(window, 'beforeinstallprompt', (event) => {
        event.preventDefault();
        if (!this.isMobileDevice() || this.isStandalone()) return;
        this.installationConfirmed.set(false);
        try {
          localStorage.removeItem('flipbase_installation_confirmed');
        } catch {
          /* Bestätigung bleibt nur lokal im Arbeitsspeicher. */
        }
        this.deferredPrompt = event as BeforeInstallPromptEvent;
        this.isInstallable.set(true);
      });
      this.listen(window, 'appinstalled', () => {
        this.clearPrompt();
        this.confirmInstallation();
        this.installDialogOpen.set(false);
      });
      this.listen(window, 'online', () => this.isOnline.set(true));
      this.listen(window, 'offline', () => this.isOnline.set(false));
    }
    void this.registerServiceWorker();
  }

  private readInstallationConfirmation(): boolean {
    try {
      return localStorage.getItem('flipbase_installation_confirmed') === 'true';
    } catch {
      return false;
    }
  }
  private confirmInstallation(): void {
    this.installationConfirmed.set(true);
    try {
      localStorage.setItem('flipbase_installation_confirmed', 'true');
    } catch {
      /* Bestätigung bleibt nur für diesen Besuch erhalten. */
    }
  }

  private listen(target: EventTarget, name: string, callback: (event: Event) => void): void {
    target.addEventListener(name, callback);
    this.destroyRef.onDestroy(() => target.removeEventListener(name, callback));
  }
  private clearPrompt(): void {
    this.deferredPrompt = null;
    this.isInstallable.set(false);
  }

  async promptInstall(): Promise<boolean> {
    const prompt = this.deferredPrompt;
    if (!prompt || !this.showInstallationOffer()) return false;
    this.clearPrompt();
    try {
      await prompt.prompt();
      return (await prompt.userChoice).outcome === 'accepted';
    } catch (error) {
      this.logger.warn('PWA-Installation fehlgeschlagen!', error);
      return false;
    }
  }

  async startInstallation(): Promise<void> {
    if (!this.showInstallationOffer() || this.isInstalling()) return;
    if (!this.isInstallable()) {
      this.installMessage.set('');
      this.installDialogOpen.set(true);
      return;
    }
    this.isInstalling.set(true);
    this.installMessage.set('');
    try {
      const accepted = await this.promptInstall();
      if (!this.isInstalled()) {
        this.installDialogOpen.set(true);
        this.installMessage.set(
          accepted
            ? 'Die Installation wurde angefordert. Bestätige die weiteren Schritte im Browser.'
            : 'Die Installation wurde nicht bestätigt. Du kannst sie erneut im Browser-Menü starten.',
        );
      }
    } finally {
      this.isInstalling.set(false);
    }
  }

  async registerServiceWorker(): Promise<void> {
    if (
      !environment.production ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    )
      return;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      });
      this.updates?.connect(registration);
      const receive = (event: MessageEvent) => {
        if (
          event.source !== navigator.serviceWorker.controller ||
          event.data?.type !== 'PWA_ASSETS_STATE'
        )
          return;
        this.offlineAssetsReady.set(event.data.ready === true);
      };
      const inspect = () => navigator.serviceWorker.controller?.postMessage({ type: 'PWA_STATUS' });
      navigator.serviceWorker.addEventListener('message', receive);
      navigator.serviceWorker.addEventListener('controllerchange', inspect);
      this.destroyRef.onDestroy(() => {
        navigator.serviceWorker.removeEventListener('message', receive);
        navigator.serviceWorker.removeEventListener('controllerchange', inspect);
      });
      inspect();
      this.swRegistered.set(true);
    } catch (error) {
      this.logger.warn('Service-Worker-Registrierung fehlgeschlagen!', error);
    }
  }
}
