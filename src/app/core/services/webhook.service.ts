import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { WebhookConfig, AppNotification, AppNotificationType } from '../models/webhook.models';
import { Sale, Purchase, EINKAUFSART_BEZEICHNUNG } from '../models/flipbase.models';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { LoggerService } from './logger.service';
import { SyncStatusService } from './sync-status.service';
import { Tables } from '../models/supabase.types';

const STORAGE_KEY_CONFIG = 'flipbase_webhook_config';

interface WindowWithWebkitAudio extends Window {
  readonly webkitAudioContext?: typeof AudioContext;
}

function createDefaultWebhookConfig(): WebhookConfig {
  return {
    discordEnabled: false,
    discordWebhookUrl: '',
    telegramEnabled: false,
    telegramBotToken: '',
    telegramChatId: '',
    customWebhookEnabled: false,
    customWebhookUrl: '',
    notifyOnSale: true,
    notifyOnPurchase: true,
    notifyOnLowMargin: true,
    soundEnabled: true,
  };
}

export interface WebhookMutationResult<T> {
  readonly data: T | null;
  readonly error: Error | null;
  readonly reportedBySyncStatus: boolean;
}

/**
 * Betrag in deutscher Schreibweise: 21,98 statt 21.98.
 *
 * `toFixed` schreibt immer mit Punkt. In einer deutschen Oberflaeche sah die
 * Meldung damit aus wie aus einem anderen Programm - ueberall sonst formatiert
 * die CurrencyPipe mit Komma.
 */
function euro(betrag: number): string {
  return betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {}
  return null;
}

@Injectable({
  providedIn: 'root',
})
export class WebhookService {
  private readonly supabase = inject(SupabaseService, { optional: true });
  private readonly syncStatus = inject(SyncStatusService, { optional: true });
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly workspaceService = inject(WorkspaceService, { optional: true });

  readonly config = signal<WebhookConfig>(createDefaultWebhookConfig());
  readonly notifications = signal<AppNotification[]>([]);
  readonly loadedWorkspaceId = signal<string | null>(null);
  private loadVersion = 0;

  readonly unreadCount = computed(() => this.notifications().filter((n) => !n.read).length);

  constructor() {
    // Alte Browserkopien enthalten Zugangsdaten und sind nicht an einen Workspace gebunden.
    try {
      getStorage()?.removeItem(STORAGE_KEY_CONFIG);
    } catch {
      // Gesperrter Browserspeicher wird weder gelesen noch erneut beschrieben.
    }

    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService?.currentWorkspace();
        void this.loadFromSupabase(ws?.id ?? '');
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  async loadFromSupabase(workspaceId: string): Promise<void> {
    const requestedWorkspaceId = workspaceId.trim();
    const loadVersion = (this.loadVersion ?? 0) + 1;
    this.loadVersion = loadVersion;
    if (!requestedWorkspaceId) {
      this.resetWorkspaceData();
      return;
    }
    if (!this.isCurrentWorkspace(requestedWorkspaceId)) return;
    if (!this.supabase) {
      this.loadedWorkspaceId.set(requestedWorkspaceId);
      return;
    }
    this.resetWorkspaceData();

    try {
      const [cfgRes, notifRes] = await Promise.all([
        this.supabase.client.functions.invoke<WebhookConfig>('webhook-dispatch', {
          body: { action: 'read', workspaceId: requestedWorkspaceId },
        }),
        this.supabase.client
          .from('app_notifications')
          .select('*')
          .eq('workspace_id', requestedWorkspaceId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (!this.isCurrentLoad(requestedWorkspaceId, loadVersion)) return;
      if (cfgRes.error || notifRes.error) throw cfgRes.error ?? notifRes.error;

      if (cfgRes.data) this.config.set(this.publicConfig(cfgRes.data));

      const mapped: AppNotification[] = (
        (notifRes.data ?? []) as Tables<'app_notifications'>[]
      ).map((n) => ({
        id: n.id,
        type: n.type as AppNotificationType,
        title: n.title,
        message: n.message,
        timestamp: n.created_at,
        read: n.read,
        link: n.link || undefined,
      }));
      this.notifications.set(mapped);
      this.loadedWorkspaceId.set(requestedWorkspaceId);
    } catch (err) {
      if (this.isCurrentLoad(requestedWorkspaceId, loadVersion)) {
        this.logger.error('Verbindungsfehler beim Laden der Benachrichtigungen:', err);
      }
    }
  }

  private resetWorkspaceData(): void {
    this.config.set(createDefaultWebhookConfig());
    this.notifications.set([]);
    this.loadedWorkspaceId.set(null);
  }

  private isCurrentWorkspace(workspaceId: string): boolean {
    return !this.workspaceService || this.workspaceService.currentWorkspace()?.id === workspaceId;
  }

  private isCurrentLoad(workspaceId: string, loadVersion: number): boolean {
    return this.loadVersion === loadVersion && this.isCurrentWorkspace(workspaceId);
  }

  async updateConfig(cfg: Partial<WebhookConfig>): Promise<WebhookMutationResult<WebhookConfig>> {
    const workspaceId = this.workspaceService?.currentWorkspace()?.id ?? null;
    const persistent = this.istPersistenterModus();
    if (persistent && !workspaceId)
      return this.webhookFehler(
        'Speichern der Webhook-Konfiguration',
        new Error('Kein aktiver Workspace.'),
      );
    if (persistent && this.loadedWorkspaceId() !== workspaceId)
      return this.webhookFehler(
        'Speichern der Webhook-Konfiguration',
        new Error('Die Webhook-Konfiguration des aktiven Workspace ist noch nicht geladen.'),
      );
    let updated = this.publicConfig({ ...this.config(), ...cfg });
    if (persistent && this.supabase && workspaceId) {
      try {
        const { data, error } = await this.supabase.client.functions.invoke<WebhookConfig>(
          'webhook-dispatch',
          {
            body: { action: 'save', workspaceId, settings: cfg },
          },
        );
        if (error || !data)
          return this.webhookFehler(
            'Speichern der Webhook-Konfiguration',
            error ?? new Error('Keine bestätigte Webhook-Konfiguration.'),
          );
        if (!this.isCurrentWorkspace(workspaceId))
          return {
            data: null,
            error: new Error('Der Workspace wurde während des Speicherns gewechselt.'),
            reportedBySyncStatus: false,
          };
        updated = this.publicConfig(data);
      } catch (error: unknown) {
        return this.webhookFehler('Speichern der Webhook-Konfiguration', error);
      }
    }
    this.config.set(updated);
    return { data: updated, error: null, reportedBySyncStatus: false };
  }

  private publicConfig(settings: WebhookConfig): WebhookConfig {
    return {
      discordEnabled: settings.discordEnabled,
      hasDiscordCredentials: settings.hasDiscordCredentials ?? false,
      telegramEnabled: settings.telegramEnabled,
      hasTelegramCredentials: settings.hasTelegramCredentials ?? false,
      customWebhookEnabled: settings.customWebhookEnabled,
      hasCustomWebhookCredentials: settings.hasCustomWebhookCredentials ?? false,
      notifyOnSale: settings.notifyOnSale,
      notifyOnPurchase: settings.notifyOnPurchase,
      notifyOnLowMargin: settings.notifyOnLowMargin,
      soundEnabled: settings.soundEnabled,
    };
  }

  addNotification(n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>): void {
    const item: AppNotification = {
      ...n,
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      read: false,
    };

    const updated = [item, ...this.notifications()].slice(0, 50);
    this.notifications.set(updated);

    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws) {
      void this.schreibeMeldungInDieDatenbank(item, ws.id);
    }

    if (this.config().soundEnabled) {
      this.playChimeSound();
    }
  }

  /**
   * Legt die Meldung in der Datenbank an und uebernimmt deren Kennung.
   *
   * Die Kennung wird gebraucht: Angezeigt wird zuerst die eigene Behelfskennung
   * (`notif-...`), die Spalte in der Datenbank ist aber eine UUID. Wer die
   * Meldung dann als gelesen markiert, wuerde mit der Behelfskennung nicht nur
   * ins Leere greifen, sondern einen Datenbankfehler ausloesen. Deshalb wird
   * sie nach dem Anlegen durch die echte ersetzt - dasselbe Vorgehen wie beim
   * Anlegen eines Einkaufs.
   */
  private async schreibeMeldungInDieDatenbank(
    item: AppNotification,
    workspaceId: string,
  ): Promise<void> {
    if (!this.supabase) return;
    try {
      const { data, error } = await this.supabase.client
        .from('app_notifications')
        .insert({
          workspace_id: workspaceId,
          type: item.type,
          title: item.title,
          message: item.message,
          read: false,
          link: item.link || null,
        })
        .select('id')
        .single();

      if (error) {
        this.syncStatus?.melde('Speichern der Benachrichtigung', error);
        return;
      }

      if (data?.id) {
        this.notifications.update((liste) =>
          liste.map((n) => (n.id === item.id ? { ...n, id: data.id } : n)),
        );
      }
    } catch (e: unknown) {
      this.syncStatus?.melde('Speichern der Benachrichtigung', e);
    }
  }

  /**
   * Markiert eine einzelne Meldung als gelesen.
   *
   * Frueher hat das Aufklappmenue dafuer `notif.read = true` direkt am Objekt
   * gesetzt. Das aendert zwar das Objekt, aber nicht das Signal: Der Zaehler an
   * der Glocke blieb stehen, und gespeichert wurde es weder im Browser noch in
   * der Datenbank - nach dem naechsten Laden war alles wieder ungelesen.
   */
  async markAsRead(id: string): Promise<WebhookMutationResult<AppNotification | null>> {
    const vorher = this.notifications();
    const notification = vorher.find((n) => n.id === id);
    if (!notification || notification.read) {
      return { data: notification ?? null, error: null, reportedBySyncStatus: false };
    }
    const ws = this.workspaceService?.currentWorkspace();
    if (this.istPersistenterModus() && !ws) {
      return this.webhookFehler(
        'Aktualisieren der Benachrichtigung',
        new Error('Kein aktiver Workspace.'),
      );
    }
    if (this.istPersistenterModus()) {
      try {
        const { error, count } = await this.supabase!.client.from('app_notifications')
          .update({ read: true }, { count: 'exact' })
          .eq('workspace_id', ws!.id)
          .eq('id', id);
        if (error || count === 0) {
          return this.webhookFehler(
            'Aktualisieren der Benachrichtigung',
            error ?? new Error('Die Benachrichtigung wurde nicht gefunden.'),
          );
        }
      } catch (error: unknown) {
        return this.webhookFehler('Aktualisieren der Benachrichtigung', error);
      }
    }
    const updatedNotification = { ...notification, read: true };
    const updated = vorher.map((n) => (n.id === id ? updatedNotification : n));
    this.notifications.set(updated);
    return { data: updatedNotification, error: null, reportedBySyncStatus: false };
  }

  async markAllAsRead(): Promise<WebhookMutationResult<readonly AppNotification[]>> {
    const vorher = this.notifications();
    const ungelesen = vorher.filter((notification) => !notification.read);
    if (ungelesen.length === 0) {
      return { data: vorher, error: null, reportedBySyncStatus: false };
    }
    const ws = this.workspaceService?.currentWorkspace();
    if (this.istPersistenterModus() && !ws) {
      return this.webhookFehler(
        'Aktualisieren der Benachrichtigungen',
        new Error('Kein aktiver Workspace.'),
      );
    }
    if (this.istPersistenterModus()) {
      try {
        const { error, count } = await this.supabase!.client.from('app_notifications')
          .update({ read: true }, { count: 'exact' })
          .eq('workspace_id', ws!.id)
          .eq('read', false);
        if (error || count === 0) {
          return this.webhookFehler(
            'Aktualisieren der Benachrichtigungen',
            error ?? new Error('Keine Benachrichtigung wurde aktualisiert.'),
          );
        }
      } catch (error: unknown) {
        return this.webhookFehler('Aktualisieren der Benachrichtigungen', error);
      }
    }
    const updated = this.notifications().map((n) => ({ ...n, read: true }));
    this.notifications.set(updated);
    return { data: updated, error: null, reportedBySyncStatus: false };
  }

  async clearNotifications(): Promise<WebhookMutationResult<readonly AppNotification[]>> {
    const vorher = this.notifications();
    if (vorher.length === 0) return { data: [], error: null, reportedBySyncStatus: false };
    const ws = this.workspaceService?.currentWorkspace();
    if (this.istPersistenterModus() && !ws) {
      return this.webhookFehler(
        'Löschen der Benachrichtigungen',
        new Error('Kein aktiver Workspace.'),
      );
    }
    if (this.istPersistenterModus()) {
      try {
        const { error, count } = await this.supabase!.client.from('app_notifications')
          .delete({ count: 'exact' })
          .eq('workspace_id', ws!.id);
        if (error || count === 0) {
          return this.webhookFehler(
            'Löschen der Benachrichtigungen',
            error ?? new Error('Keine Benachrichtigung wurde gelöscht.'),
          );
        }
      } catch (error: unknown) {
        return this.webhookFehler('Löschen der Benachrichtigungen', error);
      }
    }
    this.notifications.set([]);
    return { data: [], error: null, reportedBySyncStatus: false };
  }

  /**
   * Triggers notifications when a new sale occurs.
   */
  async sendSaleNotification(sale: Sale, itemTitle: string): Promise<void> {
    if (
      this.supabase &&
      (this.workspaceService?.currentWorkspace()?.id !== sale.workspace_id ||
        this.loadedWorkspaceId() !== sale.workspace_id)
    )
      return;
    const cfg = this.config();
    if (!cfg.notifyOnSale) return;

    const profit = euro(sale.net_profit || 0);
    const price = euro(sale.sale_price);
    const roi = sale.roi || 0;
    const platform = sale.platform || 'Kleinanzeigen';

    // 1. Add In-App notification
    this.addNotification({
      type: 'sale',
      title: `Neuer Verkauf: ${itemTitle}`,
      message: `Verkauft für ${price} € auf ${platform}. Reingewinn: +${profit} € (ROI: ${roi}%).`,
      link: '/sales',
    });

    const workspaceId = this.workspaceService?.currentWorkspace()?.id;
    if (this.supabase && workspaceId) {
      const { error } = await this.supabase.client.functions.invoke('webhook-dispatch', {
        body: { action: 'sale', workspaceId, saleId: sale.id },
      });
      if (error) this.logger.warn('Webhook-Versand fehlgeschlagen.');
    }
  }

  /**
   * Triggers notifications when a new purchase occurs.
   */
  async sendPurchaseNotification(purchase: Purchase): Promise<void> {
    const cfg = this.config();
    if (!cfg.notifyOnPurchase) return;

    const totalCost =
      purchase.purchase_price === null
        ? undefined
        : (purchase.total_purchase_cost ?? purchase.purchase_price);
    const cost = totalCost === undefined ? 'noch nicht erfasst' : `${euro(totalCost)} €`;
    const recordNumber = purchase.record_number?.trim().replace(/^#/, '');

    this.addNotification({
      type: 'purchase',
      title: recordNumber ? `Neuer Einkauf #${recordNumber}` : 'Neuer Einkauf',
      message: `Einkaufskosten: ${cost} (${EINKAUFSART_BEZEICHNUNG[purchase.type]}).`,
      // Auf den Einkauf selbst, nicht auf die Liste: Zu einer Meldung ueber
      // einen bestimmten Einkauf gehoert dieser Einkauf. Vorher landete man auf
      // der Uebersicht und musste ihn dort suchen - und wer schon dort stand,
      // sah beim Klicken gar keine Veraenderung.
      link: `/purchases/${purchase.id}`,
    });
  }

  /**
   * Sends a test webhook notification to verify credentials.
   */
  async sendTestNotification(
    channel: 'discord' | 'telegram' | 'custom',
  ): Promise<{ success: boolean; message: string }> {
    const workspaceId = this.workspaceService?.currentWorkspace()?.id;
    if (!this.supabase || !workspaceId || this.loadedWorkspaceId() !== workspaceId)
      return {
        success: false,
        message: 'Die Einstellungen des aktiven Workspace sind noch nicht geladen.',
      };
    const { data, error } = await this.supabase.client.functions.invoke<{ success: boolean }>(
      'webhook-dispatch',
      {
        body: { action: 'test', workspaceId, channel },
      },
    );
    if (!this.isCurrentWorkspace(workspaceId))
      return { success: false, message: 'Der Workspace wurde gewechselt.' };
    return error || data?.success !== true
      ? {
          success: false,
          message:
            'Webhook-Versand fehlgeschlagen. Prüfe Zugangsdaten und warte vor einem erneuten Test.',
        }
      : { success: true, message: 'Testnachricht wurde versendet.' };
  }

  private playChimeSound(): void {
    try {
      if (typeof window === 'undefined') return;
      const AudioContextClass =
        window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch {}
  }

  private istPersistenterModus(): boolean {
    return Boolean(this.supabase);
  }

  private webhookFehler<T>(vorgang: string, ursache: unknown): WebhookMutationResult<T> {
    const error =
      this.syncStatus?.melde(vorgang, ursache) ??
      (ursache instanceof Error ? ursache : new Error(String(ursache)));
    return {
      data: null,
      error,
      reportedBySyncStatus: this.syncStatus?.istZentralGemeldet(error) ?? false,
    };
  }
}
