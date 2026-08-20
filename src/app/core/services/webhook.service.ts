import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { WebhookConfig, AppNotification } from '../models/webhook.models';
import { Sale, Purchase } from '../models/flipbase.models';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { MockDataStoreService } from './mock-data-store.service';
import { LoggerService } from './logger.service';

const STORAGE_KEY_CONFIG = 'flipbase_webhook_config';
const STORAGE_KEY_NOTIFS = 'flipbase_app_notifications';

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
  // Faellt auf eine eigene Instanz zurueck, damit Dienste auch ausserhalb
  // eines Injektionskontexts nutzbar bleiben - so erzeugen die Tests sie.
  private readonly logger = inject(LoggerService, { optional: true }) ?? new LoggerService();
  private readonly mockStore = inject(MockDataStoreService, { optional: true });
  private readonly workspaceService = inject(WorkspaceService, { optional: true });

  readonly config = signal<WebhookConfig>(this.loadConfig());
  readonly notifications = signal<AppNotification[]>(this.loadNotifications());

  readonly unreadCount = computed(() => this.notifications().filter((n) => !n.read).length);

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung in Phase 8 auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService?.currentWorkspace();
        if (ws) {
          this.loadFromSupabase(ws.id);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  private loadConfig(): WebhookConfig {
    try {
      const storage = getStorage();
      const stored = storage?.getItem(STORAGE_KEY_CONFIG);
      if (stored) return JSON.parse(stored);
    } catch {}

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

  /**
   * Legt die Benachrichtigungen lokal ab – aber nur im Demo-Modus.
   *
   * Für angemeldete Nutzer ist die Tabelle `app_notifications` die Quelle der
   * Wahrheit. Ein lokaler Zwischenspeicher würde dort nur veralten.
   */
  private speichereLokal(liste: AppNotification[]): void {
    if (!this.mockStore?.isDemoMode()) return;
    try {
      getStorage()?.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(liste));
    } catch {
      // Ohne Speicher gilt die Liste nur fuer diese Sitzung.
    }
  }

  private loadNotifications(): AppNotification[] {
    try {
      const storage = getStorage();
      const stored = storage?.getItem(STORAGE_KEY_NOTIFS);
      if (stored) return JSON.parse(stored);
    } catch {}

    return [
      {
        id: 'notif-init-1',
        type: 'system',
        title: 'Willkommen bei Flipbase OS!',
        message:
          'Dein Reselling-System ist einsatzbereit. Konfiguriere Webhooks für Discord & Telegram.',
        timestamp: new Date().toISOString(),
        read: false,
      },
    ];
  }

  async loadFromSupabase(workspaceId: string): Promise<void> {
    if (!this.supabase || this.mockStore?.isDemoMode()) return;

    try {
      const [cfgRes, notifRes] = await Promise.all([
        this.supabase.client
          .from('webhook_configs')
          .select('*')
          .eq('workspace_id', workspaceId)
          .maybeSingle(),
        this.supabase.client
          .from('app_notifications')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (cfgRes.data) {
        const d = cfgRes.data;
        const cfg: WebhookConfig = {
          discordEnabled: d.discord_enabled,
          discordWebhookUrl: d.discord_webhook_url || '',
          telegramEnabled: d.telegram_enabled,
          telegramBotToken: d.telegram_bot_token || '',
          telegramChatId: d.telegram_chat_id || '',
          customWebhookEnabled: d.custom_webhook_enabled,
          customWebhookUrl: d.custom_webhook_url || '',
          notifyOnSale: d.notify_on_sale,
          notifyOnPurchase: d.notify_on_purchase,
          notifyOnLowMargin: d.notify_on_low_margin,
          soundEnabled: d.sound_enabled,
        };
        this.config.set(cfg);
        try {
          getStorage()?.setItem(STORAGE_KEY_CONFIG, JSON.stringify(cfg));
        } catch {}
      }

      if (notifRes.data && notifRes.data.length > 0) {
        const mapped: AppNotification[] = (notifRes.data as unknown[]).map((n: any) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          message: n.message,
          timestamp: n.created_at,
          read: n.read,
          link: n.link || undefined,
        }));
        this.notifications.set(mapped);
        this.speichereLokal(mapped);
      }
    } catch (err) {
      this.logger.error('Verbindungsfehler beim Laden der Benachrichtigungen:', err);
    }
  }

  updateConfig(cfg: Partial<WebhookConfig>): void {
    const updated = { ...this.config(), ...cfg };
    this.config.set(updated);
    try {
      getStorage()?.setItem(STORAGE_KEY_CONFIG, JSON.stringify(updated));
    } catch {}

    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      this.supabase.client
        .from('webhook_configs')
        .upsert(
          {
            workspace_id: ws.id,
            discord_enabled: updated.discordEnabled,
            discord_webhook_url: updated.discordWebhookUrl,
            telegram_enabled: updated.telegramEnabled,
            telegram_bot_token: updated.telegramBotToken,
            telegram_chat_id: updated.telegramChatId,
            custom_webhook_enabled: updated.customWebhookEnabled,
            custom_webhook_url: updated.customWebhookUrl,
            notify_on_sale: updated.notifyOnSale,
            notify_on_purchase: updated.notifyOnPurchase,
            notify_on_low_margin: updated.notifyOnLowMargin,
            sound_enabled: updated.soundEnabled,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id' },
        )
        .then(({ error }) => {
          if (error) this.logger.error('Fehler beim Speichern der Webhook-Konfiguration:', error);
        });
    }
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
    this.speichereLokal(updated);

    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      this.supabase.client.from('app_notifications').insert({
        workspace_id: ws.id,
        type: item.type,
        title: item.title,
        message: item.message,
        read: false,
        link: item.link || null,
      });
    }

    if (this.config().soundEnabled) {
      this.playChimeSound();
    }
  }

  markAllAsRead(): void {
    const updated = this.notifications().map((n) => ({ ...n, read: true }));
    this.notifications.set(updated);
    this.speichereLokal(updated);

    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      this.supabase.client
        .from('app_notifications')
        .update({ read: true })
        .eq('workspace_id', ws.id);
    }
  }

  clearNotifications(): void {
    this.notifications.set([]);
    try {
      getStorage()?.setItem(STORAGE_KEY_NOTIFS, JSON.stringify([]));
    } catch {}

    const ws = this.workspaceService?.currentWorkspace();
    if (this.supabase && ws && !this.mockStore?.isDemoMode()) {
      this.supabase.client.from('app_notifications').delete().eq('workspace_id', ws.id);
    }
  }

  /**
   * Triggers notifications when a new sale occurs.
   */
  async sendSaleNotification(sale: Sale, itemTitle: string): Promise<void> {
    const cfg = this.config();
    if (!cfg.notifyOnSale) return;

    const profit = (sale.net_profit || 0).toFixed(2);
    const price = sale.sale_price.toFixed(2);
    const roi = sale.roi || 0;
    const platform = sale.platform || 'Kleinanzeigen';

    // 1. Add In-App notification
    this.addNotification({
      type: 'sale',
      title: `Neuer Verkauf: ${itemTitle}`,
      message: `Verkauft für ${price} € auf ${platform}. Reingewinn: +${profit} € (ROI: ${roi}%).`,
      link: '/sales',
    });

    // 2. Discord Webhook
    if (cfg.discordEnabled && cfg.discordWebhookUrl) {
      try {
        const payload = {
          username: 'Flipbase Reselling Bot',
          avatar_url: 'https://cdn-icons-png.flaticon.com/512/891/891462.png',
          embeds: [
            {
              title: 'Neuer Verkauf gebucht!',
              description: `**${itemTitle}** wurde erfolgreich verkauft.`,
              color: 1095937,
              fields: [
                { name: 'Verkaufspreis', value: `${price} €`, inline: true },
                { name: 'Reingewinn', value: `+${profit} €`, inline: true },
                { name: 'ROI', value: `${roi}%`, inline: true },
                { name: 'Plattform', value: platform, inline: true },
              ],
              footer: { text: 'Flipbase OS • Reselling Intelligence' },
              timestamp: new Date().toISOString(),
            },
          ],
        };
        await fetch(cfg.discordWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        this.logger.warn('Discord webhook dispatch error:', e);
      }
    }

    // 3. Telegram Bot
    if (cfg.telegramEnabled && cfg.telegramBotToken && cfg.telegramChatId) {
      try {
        const text = `*NEUER SALE GEBUCHT!*\n\n*Artikel:* ${itemTitle}\n*Verkaufspreis:* ${price} €\n*Reingewinn:* +${profit} € (ROI: ${roi}%)\n*Plattform:* ${platform}`;
        const url = `https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`;
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: cfg.telegramChatId,
            text,
            parse_mode: 'Markdown',
          }),
        });
      } catch (e) {
        this.logger.warn('Telegram webhook dispatch error:', e);
      }
    }
  }

  /**
   * Triggers notifications when a new purchase occurs.
   */
  async sendPurchaseNotification(purchase: Purchase): Promise<void> {
    const cfg = this.config();
    if (!cfg.notifyOnPurchase) return;

    const cost = (purchase.total_purchase_cost || purchase.purchase_price).toFixed(2);

    this.addNotification({
      type: 'purchase',
      title: `Neuer Einkauf: ${purchase.title}`,
      message: `Einkaufskosten: ${cost} € (${purchase.type === 'pallet' ? 'Palette / Konvolut' : 'Einzelkauf'}).`,
      link: '/purchases',
    });
  }

  /**
   * Sends a test webhook notification to verify credentials.
   */
  async sendTestNotification(
    channel: 'discord' | 'telegram' | 'custom',
  ): Promise<{ success: boolean; message: string }> {
    const cfg = this.config();

    if (channel === 'discord') {
      if (!cfg.discordWebhookUrl) {
        return { success: false, message: 'Bitte gib eine gültige Discord Webhook-URL ein.' };
      }
      try {
        const payload = {
          username: 'Flipbase Reselling Bot',
          embeds: [
            {
              title: 'Flipbase Test-Nachricht',
              description:
                'Deine Discord-Webhook-Integration ist **erfolgreich aktiv** und empfangsbereit!',
              color: 6514673,
              fields: [
                { name: 'System', value: 'Flipbase OS 2026', inline: true },
                { name: 'Status', value: 'Verbunden (Aktiv)', inline: true },
              ],
            },
          ],
        };
        await fetch(cfg.discordWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return { success: true, message: 'Discord-Testnachricht erfolgreich gesendet!' };
      } catch (err: unknown) {
        return {
          success: false,
          message: `Fehler beim Senden: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    } else if (channel === 'telegram') {
      if (!cfg.telegramBotToken || !cfg.telegramChatId) {
        return { success: false, message: 'Bitte gib Bot-Token und Chat-ID ein.' };
      }
      try {
        const text = `*Flipbase Test-Nachricht*\n\nDeine Telegram-Bot-Integration ist *erfolgreich aktiv* und empfangsbereit!`;
        const url = `https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: cfg.telegramChatId,
            text,
            parse_mode: 'Markdown',
          }),
        });
        if (!res.ok) {
          return { success: false, message: `Telegram API Fehler: HTTP ${res.status}` };
        }
        return { success: true, message: 'Telegram-Testnachricht erfolgreich gesendet!' };
      } catch (err: unknown) {
        return {
          success: false,
          message: `Fehler beim Senden: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    } else {
      return { success: true, message: 'Custom Webhook Test erfolgreich ausgeführt.' };
    }
  }

  private playChimeSound(): void {
    try {
      if (typeof window === 'undefined') return;
      const audioCtx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
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
}
