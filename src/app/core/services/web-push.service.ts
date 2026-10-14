import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { WebhookService } from './webhook.service';
import { AuthService } from './auth.service';
import { WorkspaceService } from './workspace.service';
import { PwaService } from './pwa.service';
import { WebPushApiService } from './web-push-api.service';
import { WebPushRevocationStoreService } from './web-push-revocation-store.service';
import {
  WebPushCategory,
  WebPushDeviceStatus,
  WebPushLocalBinding,
  WebPushServerSettings,
  WebPushSubscription,
  isPushIdentifier,
} from '../models/web-push.models';

export interface WebPushSettings {
  enabled: boolean;
  notifyOnShopOrder: boolean;
  notifyOnFulfillment: boolean;
  notifyOnMarginAlert: boolean;
  soundEnabled: boolean;
}

const STORAGE_KEY_PUSH_SETTINGS = 'flipbase_web_push_settings';

@Injectable({
  providedIn: 'root',
})
export class WebPushService {
  private readonly webhookService: WebhookService | null = null;
  private readonly api = inject(WebPushApiService, { optional: true });
  private readonly store = inject(WebPushRevocationStoreService, { optional: true });
  private readonly auth = inject(AuthService, { optional: true });
  private readonly workspace = inject(WorkspaceService, { optional: true });
  private readonly pwa = inject(PwaService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  readonly deviceStatus = signal<WebPushDeviceStatus>('checking');
  readonly deviceMessage = signal('');
  readonly isBusy = signal(false);
  readonly serverSettings = signal<WebPushServerSettings | null>(null);
  readonly categories = signal<WebPushCategory[]>([]);
  readonly allowedCategories = computed(() => this.serverSettings()?.allowedCategories ?? []);
  readonly isActive = computed(() => this.deviceStatus() === 'active');
  readonly canDeactivate = computed(
    () =>
      !this.isBusy() &&
      Boolean(
        this.serverSettings()?.binding ||
        ['active', 'pending', 'revoke_pending', 'error'].includes(this.deviceStatus()),
      ),
  );
  readonly canActivate = computed(() =>
    Boolean(
      this.serverSettings()?.enabled &&
      this.allowedCategories().length > 0 &&
      this.registrationActive() &&
      this.isSupported() &&
      !this.isBusy() &&
      ['ready', 'permission_required', 'pending'].includes(this.deviceStatus()),
    ),
  );
  private registration: ServiceWorkerRegistration | null = null;
  private readonly registrationActive = signal(false);
  private registrationCleanup: (() => void) | null = null;
  private generation = 0;
  private refreshRequested = false;
  private preferencesPending = false;
  private contextIdentity: string | null = null;

  readonly permission = signal<'granted' | 'denied' | 'default' | 'unsupported'>('default');
  readonly isSupported = signal<boolean>(false);
  readonly settings = signal<WebPushSettings>(this.loadSettings());
  readonly lastNotificationSent = signal<string | null>(null);

  constructor() {
    try {
      this.webhookService = inject(WebhookService, { optional: true });
    } catch {
      this.webhookService = null;
    }

    this.checkSupportAndPermission();
    this.destroyRef.onDestroy(() => this.registrationCleanup?.());
    if (this.auth && this.workspace)
      effect(() => {
        const userId = this.auth?.currentUser()?.id;
        const workspaceId = this.workspace?.currentWorkspace()?.id;
        const contextIdentity =
          userId && workspaceId ? `${userId}:${this.sessionId()}:${workspaceId}` : null;
        this.pwa?.swRegistered();
        untracked(() => {
          this.generation++;
          if (contextIdentity !== this.contextIdentity) {
            this.contextIdentity = contextIdentity;
            this.preferencesPending = false;
            this.serverSettings.set(null);
            this.categories.set([]);
            this.deviceStatus.set(userId && workspaceId ? 'checking' : 'disabled');
          }
          if (userId && workspaceId) void this.refreshDevice();
          else this.deviceStatus.set('disabled');
        });
      });
    if (typeof window !== 'undefined') {
      const refresh = () => {
        if (this.auth?.currentUser()) void this.refreshDevice();
      };
      const storageChanged = (event: StorageEvent) => {
        if (event.key !== null && !event.key.startsWith('flipbase_push_')) return;
        this.generation++;
        this.deviceStatus.set('checking');
        refresh();
      };
      const resume = () => {
        if (document.visibilityState === 'visible') refresh();
      };
      window.addEventListener('online', refresh);
      window.addEventListener('storage', storageChanged);
      document.addEventListener('visibilitychange', resume);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('online', refresh);
        window.removeEventListener('storage', storageChanged);
        document.removeEventListener('visibilitychange', resume);
      });
    }
  }

  private sessionId(): string | null {
    try {
      const token = this.auth?.session()?.access_token;
      if (!token) return null;
      const claims = JSON.parse(
        atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
      ) as { session_id?: unknown };
      return isPushIdentifier(claims.session_id) ? claims.session_id : null;
    } catch {
      return null;
    }
  }
  private capability(): 'supported' | 'unsupported' | 'home_app_required' | 'denied' {
    this.checkSupportAndPermission();
    const isAppleMobile =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isAppleMobile && !this.pwa?.isStandalone()) return 'home_app_required';
    if (
      !window.isSecureContext ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window) ||
      !navigator.locks
    )
      return 'unsupported';
    return Notification.permission === 'denied' ? 'denied' : 'supported';
  }
  private subscriptionFields(subscription: PushSubscription): WebPushSubscription {
    const serialized = subscription.toJSON();
    const p256dh = serialized.keys?.['p256dh'];
    const auth = serialized.keys?.['auth'];
    if (!serialized.endpoint || !p256dh || !auth)
      throw new Error('Das Browserabonnement ist unvollständig.');
    return { endpoint: serialized.endpoint, p256dh, auth };
  }
  private watchRegistration(registration: ServiceWorkerRegistration | null): void {
    this.registrationCleanup?.();
    this.registration = registration;
    const update = () => this.registrationActive.set(Boolean(registration?.active));
    update();
    const worker = registration?.installing ?? registration?.waiting;
    worker?.addEventListener('statechange', update);
    navigator.serviceWorker?.addEventListener('controllerchange', update);
    this.registrationCleanup = () => {
      worker?.removeEventListener('statechange', update);
      navigator.serviceWorker?.removeEventListener('controllerchange', update);
    };
  }
  private applyCategorySettings(
    settings: WebPushServerSettings,
    selection: WebPushCategory[],
  ): boolean {
    const permittedSelection = selection.filter((category) =>
      settings.allowedCategories.includes(category),
    );
    this.serverSettings.set(settings);
    this.categories.set(permittedSelection);
    const removedCategories = permittedSelection.length !== selection.length;
    if (removedCategories) {
      this.preferencesPending = true;
      this.deviceMessage.set(
        'Die verfügbaren Kategorien haben sich geändert. Prüfe deine Auswahl und aktiviere dieses Gerät erneut.',
      );
    }
    return removedCategories;
  }
  async refreshDevice(): Promise<void> {
    if (this.isBusy()) {
      this.refreshRequested = true;
      return;
    }
    if (!this.api || !this.store) return;
    this.refreshRequested = false;
    const userId = this.auth?.currentUser()?.id;
    const workspaceId = this.workspace?.currentWorkspace()?.id;
    if (!userId || !workspaceId) return;
    const sequence = ++this.generation;
    this.deviceStatus.set('checking');
    try {
      const bindings = this.store.listBindings();
      for (const binding of bindings)
        if (binding.userId !== userId || binding.sessionId !== this.sessionId())
          this.store.markForRevoke(binding.userId);
      const cleaned = await this.store.flush((generationId, token) =>
        this.api
          ? this.api.revokeBinding(generationId, token)
          : Promise.reject(new Error('API fehlt.')),
      );
      if (sequence !== this.generation) return;
      if (!cleaned) {
        this.deviceStatus.set('revoke_pending');
        this.deviceMessage.set('Die frühere Gerätebindung muss zuerst online deaktiviert werden.');
        return;
      }
      const settings = await this.api.loadSettings(this.store.getInstallationId(), workspaceId);
      const capability = this.capability();
      const registration =
        'serviceWorker' in navigator
          ? ((await navigator.serviceWorker.getRegistration('/')) ?? null)
          : null;
      if (sequence !== this.generation) return;
      this.watchRegistration(registration);
      const selection = this.preferencesPending
        ? this.categories()
        : (settings.preferences.find((preference) => preference.workspaceId === workspaceId)
            ?.categories ??
          (settings.binding && settings.preferences.length ? [] : [...settings.allowedCategories]));
      const selectionAdjusted = this.applyCategorySettings(settings, selection);
      if (capability !== 'supported') {
        this.deviceStatus.set(capability);
        return;
      }
      if (this.store.corruptedGenerationIds().length) {
        this.deviceStatus.set('error');
        this.deviceMessage.set(
          'Die lokale Push-Zuordnung ist beschädigt. Deaktiviere dieses Gerät online und aktiviere es danach erneut.',
        );
        return;
      }
      if (!settings.enabled) {
        this.deviceStatus.set('disabled');
        this.deviceMessage.set('Push wird nach der Geräteabnahme freigegeben.');
        return;
      }
      if (!settings.allowedCategories.length) {
        this.deviceStatus.set('disabled');
        this.deviceMessage.set(
          'Push ist in diesem Arbeitsbereich nicht verfügbar. Wähle einen aktiven Arbeitsbereich.',
        );
        return;
      }
      // Im iPad-Browser kann schon dieser Aufruf fehlschlagen. Erst nach der
      // Fähigkeitsprüfung abfragen, damit der Hinweis zur Home-App erhalten bleibt.
      const subscription = await this.registration?.pushManager?.getSubscription();
      if (sequence !== this.generation) return;
      const local = this.store
        .listBindings()
        .find(
          (binding) =>
            binding.userId === userId &&
            binding.sessionId === this.sessionId() &&
            binding.generationId === settings.binding?.deviceId,
        );
      if (
        subscription &&
        local?.state === 'active' &&
        settings.binding?.active &&
        settings.binding.keyId === settings.keyId &&
        local.keyId === settings.keyId &&
        JSON.stringify(local.subscription) === JSON.stringify(this.subscriptionFields(subscription))
      )
        this.deviceStatus.set(
          this.preferencesPending ||
            !settings.preferences.some((preference) => preference.workspaceId === workspaceId)
            ? 'pending'
            : 'active',
        );
      else {
        this.deviceStatus.set(
          Notification.permission === 'granted' ? 'ready' : 'permission_required',
        );
        if (!selectionAdjusted)
          this.deviceMessage.set(
            settings.binding?.keyId && settings.binding.keyId !== settings.keyId
              ? 'Der Push-Schlüssel wurde erneuert. Aktiviere dieses Gerät erneut.'
              : 'Aktiviere dieses Gerät und wähle die gewünschten Kategorien.',
          );
      }
    } catch (reason) {
      if (sequence === this.generation) {
        this.deviceStatus.set('error');
        this.deviceMessage.set(
          reason instanceof Error ? reason.message : 'Push konnte nicht geprüft werden.',
        );
      }
    }
  }

  async activateDevice(): Promise<boolean> {
    const api = this.api;
    const store = this.store;
    const registration = this.registration;
    if (!this.canActivate() || !api || !store || !registration) return false;
    const userId = this.auth?.currentUser()?.id;
    const sessionId = this.sessionId();
    const workspaceId = this.workspace?.currentWorkspace()?.id;
    const selectedCategories = [...this.categories()];
    if (!userId || !sessionId || !workspaceId) return false;
    const sameContext = () =>
      this.auth?.currentUser()?.id === userId &&
      this.sessionId() === sessionId &&
      this.workspace?.currentWorkspace()?.id === workspaceId;
    // Der Browserdialog muss unmittelbar aus dem Klick entstehen.
    let permission: Promise<NotificationPermission>;
    try {
      permission =
        Notification.permission === 'granted'
          ? Promise.resolve('granted' as const)
          : Notification.requestPermission();
    } catch {
      this.deviceStatus.set('error');
      this.deviceMessage.set(
        'Die Browserfreigabe konnte nicht geöffnet werden. Prüfe deinen Browser und versuche es erneut.',
      );
      return false;
    }
    const sequence = ++this.generation;
    this.isBusy.set(true);
    this.deviceStatus.set('registering');
    let binding: WebPushLocalBinding | undefined;
    let subscription: PushSubscription | null = null;
    try {
      const result = await permission;
      if (!sameContext() || sequence !== this.generation) return false;
      this.permission.set(result);
      if (result !== 'granted') {
        this.deviceStatus.set(result === 'denied' ? 'denied' : 'permission_required');
        return false;
      }
      return await store.runExclusive(async () => {
        const settings = await api.loadSettings(store.getInstallationId(), workspaceId);
        if (!sameContext() || sequence !== this.generation) return false;
        const previousAllowedCategories = this.allowedCategories();
        const permissionsChanged =
          previousAllowedCategories.some(
            (category) => !settings.allowedCategories.includes(category),
          ) ||
          settings.allowedCategories.some(
            (category) => !previousAllowedCategories.includes(category),
          );
        const selectionAdjusted = this.applyCategorySettings(settings, selectedCategories);
        if (!settings.enabled) {
          this.serverSettings.set(settings);
          this.deviceStatus.set('disabled');
          this.deviceMessage.set('Push ist derzeit nicht freigegeben.');
          return false;
        }
        if (!settings.allowedCategories.length) {
          this.deviceStatus.set('disabled');
          this.deviceMessage.set(
            'Push ist in diesem Arbeitsbereich nicht verfügbar. Wähle einen aktiven Arbeitsbereich.',
          );
          return false;
        }
        if (permissionsChanged || selectionAdjusted) {
          this.preferencesPending = true;
          this.deviceStatus.set('pending');
          this.deviceMessage.set(
            'Die verfügbaren Kategorien haben sich geändert. Prüfe deine Auswahl und aktiviere dieses Gerät erneut.',
          );
          return false;
        }
        if (store.corruptedGenerationIds().length)
          throw new Error('Die frühere Gerätebindung muss zuerst deaktiviert werden.');
        const sameUser = () =>
          this.auth?.currentUser()?.id === userId &&
          this.sessionId() === sessionId &&
          this.workspace?.currentWorkspace()?.id === workspaceId &&
          sequence === this.generation;
        const confirmPreferences = async (deviceId: string) => {
          if (!sameUser()) return false;
          if (selectedCategories.some((category) => !settings.allowedCategories.includes(category)))
            throw new Error('Die verfügbaren Kategorien haben sich geändert. Prüfe deine Auswahl.');
          this.preferencesPending = true;
          await api.savePreferences(deviceId, workspaceId, selectedCategories);
          if (!sameUser()) return false;
          this.preferencesPending = false;
          this.categories.set(selectedCategories);
          return true;
        };
        if (!sameUser()) return false;
        if (
          !(await store.flush((generationId, token) =>
            api ? api.revokeBinding(generationId, token) : Promise.reject(new Error('API fehlt.')),
          ))
        )
          throw new Error('Der vorherige Serverwiderruf ist noch ausstehend.');
        if (!sameUser()) return false;
        subscription = await registration.pushManager.getSubscription();
        if (!sameUser()) return false;
        const existing = store
          .listBindings()
          .find(
            (candidate) =>
              candidate.generationId === settings.binding?.deviceId &&
              candidate.userId === userId &&
              candidate.sessionId === sessionId &&
              candidate.state === 'active' &&
              candidate.keyId === settings.keyId,
          );
        if (
          sameUser() &&
          settings.binding?.active &&
          existing &&
          subscription &&
          JSON.stringify(existing.subscription) ===
            JSON.stringify(this.subscriptionFields(subscription))
        ) {
          this.serverSettings.set(settings);
          binding = existing;
          if (!(await confirmPreferences(existing.generationId))) return false;
          this.deviceStatus.set('active');
          return true;
        }
        const pending = store
          .listBindings()
          .find(
            (candidate) =>
              candidate.state === 'prepared' &&
              candidate.userId === userId &&
              candidate.sessionId === sessionId &&
              candidate.keyId === settings.keyId &&
              !(
                settings.binding?.deviceId === candidate.generationId && !settings.binding.active
              ) &&
              subscription &&
              JSON.stringify(candidate.subscription) ===
                JSON.stringify(this.subscriptionFields(subscription)),
          );
        if (!pending && (settings.binding || subscription)) {
          if (settings.binding) await api.revoke(settings.binding.deviceId);
          if (!sameUser()) return false;
          store.markForRevoke(userId);
          if (
            !(await store.flush((generationId, token) =>
              api
                ? api.revokeBinding(generationId, token)
                : Promise.reject(new Error('API fehlt.')),
            ))
          )
            throw new Error('Die frühere Bindung muss erst deaktiviert werden.');
          if (!sameUser()) return false;
          if (subscription && !(await subscription.unsubscribe()))
            throw new Error('Das frühere Browserabonnement konnte nicht entfernt werden.');
          subscription = null;
        }
        if (!sameUser()) return false;
        if (!subscription) {
          const bytes = Uint8Array.from(
            atob(settings.publicKey.replace(/-/g, '+').replace(/_/g, '/')),
            (character) => character.charCodeAt(0),
          );
          if (bytes.length !== 65) throw new Error('Der öffentliche Push-Schlüssel ist ungültig.');
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: bytes,
          });
        }
        if (!sameUser()) {
          await subscription.unsubscribe();
          return false;
        }
        binding =
          pending ??
          (await store.prepare(
            userId,
            sessionId,
            settings.keyId,
            this.subscriptionFields(subscription),
          ));
        if (!sameUser()) {
          store.markForRevoke(userId);
          throw new Error('Die Anmeldung hat sich geändert.');
        }
        const {
          generationId,
          installationId,
          tokenHash,
          keyId,
          subscription: storedSubscription,
        } = binding;
        const confirmed = await api.register({
          generationId,
          installationId,
          tokenHash,
          keyId,
          subscription: storedSubscription,
        });
        if (!sameUser()) {
          store.markForRevoke(userId);
          return false;
        }
        if (!confirmed.active || !store.confirm(generationId))
          throw new Error('Die Gerätebindung wurde deaktiviert.');
        this.serverSettings.update((current) =>
          current
            ? { ...current, binding: { deviceId: generationId, active: true, keyId } }
            : current,
        );
        if (!(await confirmPreferences(generationId))) return false;
        this.deviceStatus.set('active');
        this.deviceMessage.set('Deine gewählten Kategorien wurden bestätigt.');
        return true;
      });
    } catch (reason) {
      if (!binding)
        await (subscription as PushSubscription | null)?.unsubscribe().catch(() => false);
      if (sequence === this.generation) {
        this.deviceStatus.set(binding ? 'pending' : 'error');
        this.deviceMessage.set(
          reason instanceof Error ? reason.message : 'Die Aktivierung ist noch ausstehend.',
        );
      }
      return false;
    } finally {
      this.isBusy.set(false);
      if (!sameContext() || sequence !== this.generation || this.refreshRequested)
        void this.refreshDevice();
    }
  }
  async saveCategories(categories: WebPushCategory[]): Promise<boolean> {
    if (!this.isActive() || this.isBusy() || !this.api || !this.store) return false;
    const userId = this.auth?.currentUser()?.id;
    const workspaceId = this.workspace?.currentWorkspace()?.id;
    const sessionId = this.sessionId();
    const binding = this.store
      .listBindings()
      .find(
        (candidate) =>
          candidate.userId === userId &&
          candidate.sessionId === this.sessionId() &&
          candidate.state === 'active' &&
          candidate.generationId === this.serverSettings()?.binding?.deviceId,
      );
    if (
      !workspaceId ||
      !binding ||
      categories.some((category) => !this.allowedCategories().includes(category))
    )
      return false;
    this.isBusy.set(true);
    this.categories.set([...categories]);
    const sequence = this.generation;
    try {
      await this.api.savePreferences(binding.generationId, workspaceId, categories);
      if (
        this.auth?.currentUser()?.id !== userId ||
        this.sessionId() !== sessionId ||
        sequence !== this.generation ||
        this.workspace?.currentWorkspace()?.id !== workspaceId
      )
        return false;
      this.categories.set([...categories]);
      this.preferencesPending = false;
      return true;
    } catch (reason) {
      if (sequence !== this.generation) return false;
      this.preferencesPending = true;
      this.deviceStatus.set('pending');
      this.deviceMessage.set(
        reason instanceof Error
          ? reason.message
          : 'Die Kategorien konnten nicht gespeichert werden.',
      );
      return false;
    } finally {
      this.isBusy.set(false);
      if (this.sessionId() !== sessionId || sequence !== this.generation || this.refreshRequested)
        void this.refreshDevice();
    }
  }
  selectCategories(categories: WebPushCategory[]): void {
    if (
      !this.isBusy() &&
      categories.every((category) => this.allowedCategories().includes(category))
    ) {
      this.preferencesPending = true;
      this.categories.set([...categories]);
    }
  }
  async deactivateDevice(): Promise<boolean> {
    const store = this.store;
    const api = this.api;
    if (!store || !api || this.isBusy()) return false;
    const userId = this.auth?.currentUser()?.id;
    if (!userId) return false;
    this.isBusy.set(true);
    const sequence = this.generation;
    const serverBinding = this.serverSettings()?.binding;
    try {
      return await store.runExclusive(async () => {
        if (sequence !== this.generation || this.auth?.currentUser()?.id !== userId) return false;
        for (const generationId of store.corruptedGenerationIds()) {
          await api.revoke(generationId);
          store.remove(generationId);
        }
        store.markForRevoke(userId);
        let complete = await store.flush((generationId, token) =>
          api ? api.revokeBinding(generationId, token) : Promise.reject(new Error('API fehlt.')),
        );
        if (serverBinding?.active) {
          try {
            await api.revoke(serverBinding.deviceId);
          } catch {
            complete = false;
          }
        }
        if (sequence !== this.generation || this.auth?.currentUser()?.id !== userId) return false;
        const subscription = await this.registration?.pushManager?.getSubscription();
        if (sequence !== this.generation || this.auth?.currentUser()?.id !== userId) return false;
        const browserComplete = !subscription || (await subscription.unsubscribe());
        if (sequence !== this.generation) return false;
        this.deviceStatus.set(complete && browserComplete ? 'ready' : 'revoke_pending');
        this.deviceMessage.set(
          complete
            ? 'Die Serverbindung wurde deaktiviert.'
            : 'Lokal deaktiviert. Der Serverwiderruf wird bei der nächsten Verbindung abgeschlossen.',
        );
        return complete && browserComplete;
      });
    } finally {
      this.isBusy.set(false);
      if (sequence !== this.generation || this.refreshRequested) void this.refreshDevice();
    }
  }

  private checkSupportAndPermission(): void {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.isSupported.set(true);
      this.permission.set(Notification.permission);
    } else {
      this.isSupported.set(false);
      this.permission.set('unsupported');
    }
  }

  private loadSettings(): WebPushSettings {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY_PUSH_SETTINGS);
        if (stored) return JSON.parse(stored);
      }
    } catch {}

    return {
      enabled: true,
      notifyOnShopOrder: true,
      notifyOnFulfillment: true,
      notifyOnMarginAlert: true,
      soundEnabled: true,
    };
  }

  updateSettings(updates: Partial<WebPushSettings>): void {
    const updated = { ...this.settings(), ...updates };
    this.settings.set(updated);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY_PUSH_SETTINGS, JSON.stringify(updated));
      }
    } catch {}
  }

  async requestPermission(): Promise<boolean> {
    return this.activateDevice();
  }

  /**
   * Displays a browser push notification if permitted and plays sound.
   */
  sendNotification(
    title: string,
    options?: { body?: string; icon?: string; badge?: string; tag?: string },
  ): boolean {
    const currentPerm = this.permission();
    const cfg = this.settings();

    if (!cfg.enabled) return false;

    // Log to in-app webhook / notification feed
    if (this.webhookService) {
      this.webhookService.addNotification({
        title,
        message: options?.body || '',
        type: 'system',
      });
    }

    this.lastNotificationSent.set(title);

    // Vordergrundhinweis bleibt lokal; echte OS-Meldungen kommen ausschließlich vom Server.
    return currentPerm === 'granted';
  }

  async sendTestNotification(): Promise<boolean> {
    if (!this.isActive() || !this.api || !this.store) return false;
    const userId = this.auth?.currentUser()?.id;
    const workspaceId = this.workspace?.currentWorkspace()?.id;
    const binding = this.store
      .listBindings()
      .find(
        (candidate) =>
          candidate.userId === userId &&
          candidate.sessionId === this.sessionId() &&
          candidate.state === 'active' &&
          candidate.generationId === this.serverSettings()?.binding?.deviceId,
      );
    if (!binding || !workspaceId) return false;
    try {
      await this.api.sendTest(binding.generationId, workspaceId);
      return true;
    } catch (reason) {
      this.deviceMessage.set(
        reason instanceof Error ? reason.message : 'Der Test konnte nicht angenommen werden.',
      );
      return false;
    }
  }

  triggerShopOrderNotification(orderNumber: string, customerName: string, amount: number): void {
    if (!this.settings().notifyOnShopOrder) return;

    this.sendNotification(`Neue Shop-Bestellung #${orderNumber}`, {
      body: `${customerName} hat eine Bestellung über ${amount.toFixed(2)} € aufgegeben.`,
      tag: `order-${orderNumber}`,
    });
  }

  triggerFulfillmentNotification(carrier: string, trackingNumber: string): void {
    if (!this.settings().notifyOnFulfillment) return;

    this.sendNotification(`${carrier} Versandlabel erstellt`, {
      body: `Sendungsnummer: ${trackingNumber} - Paket ist bereit zum Packen.`,
      tag: `fulfillment-${trackingNumber}`,
    });
  }
}
