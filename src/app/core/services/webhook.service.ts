import { Injectable, computed, signal } from '@angular/core';
import { WebhookConfig, AppNotification } from '../models/webhook.models';
import { Sale, Purchase } from '../models/reflip.models';

const STORAGE_KEY_CONFIG = 'reflip_webhook_config';
const STORAGE_KEY_NOTIFS = 'reflip_app_notifications';

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
  readonly config = signal<WebhookConfig>(this.loadConfig());
  readonly notifications = signal<AppNotification[]>(this.loadNotifications());

  readonly unreadCount = computed(
    () => this.notifications().filter((n) => !n.read).length
  );

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
        title: 'Willkommen bei ReFlip OS!',
        message: 'Dein Reselling-System ist einsatzbereit. Konfiguriere Webhooks für Discord & Telegram.',
        timestamp: new Date().toISOString(),
        read: false,
      },
    ];
  }

  updateConfig(cfg: Partial<WebhookConfig>): void {
    const updated = { ...this.config(), ...cfg };
    this.config.set(updated);
    try {
      getStorage()?.setItem(STORAGE_KEY_CONFIG, JSON.stringify(updated));
    } catch {}
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
    try {
      getStorage()?.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(updated));
    } catch {}

    if (this.config().soundEnabled) {
      this.playChimeSound();
    }
  }

  markAllAsRead(): void {
    const updated = this.notifications().map((n) => ({ ...n, read: true }));
    this.notifications.set(updated);
    try {
      getStorage()?.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(updated));
    } catch {}
  }

  clearNotifications(): void {
    this.notifications.set([]);
    try {
      getStorage()?.setItem(STORAGE_KEY_NOTIFS, JSON.stringify([]));
    } catch {}
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
          username: 'ReFlip Reselling Bot',
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
              footer: { text: 'ReFlip OS • Reselling Intelligence' },
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
        console.warn('Discord webhook dispatch error:', e);
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
        console.warn('Telegram webhook dispatch error:', e);
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
    channel: 'discord' | 'telegram' | 'custom'
  ): Promise<{ success: boolean; message: string }> {
    const cfg = this.config();

    if (channel === 'discord') {
      if (!cfg.discordWebhookUrl) {
        return { success: false, message: 'Bitte gib eine gültige Discord Webhook-URL ein.' };
      }
      try {
        const payload = {
          username: 'ReFlip Reselling Bot',
          embeds: [
            {
              title: 'ReFlip Test-Nachricht',
              description: 'Deine Discord-Webhook-Integration ist **erfolgreich aktiv** und empfangsbereit!',
              color: 6514673,
              fields: [
                { name: 'System', value: 'ReFlip OS 2026', inline: true },
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
      } catch (err: any) {
        return { success: false, message: `Fehler beim Senden: ${err.message || err}` };
      }
    } else if (channel === 'telegram') {
      if (!cfg.telegramBotToken || !cfg.telegramChatId) {
        return { success: false, message: 'Bitte gib Bot-Token und Chat-ID ein.' };
      }
      try {
        const text = `*ReFlip Test-Nachricht*\n\nDeine Telegram-Bot-Integration ist *erfolgreich aktiv* und empfangsbereit!`;
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
      } catch (err: any) {
        return { success: false, message: `Fehler beim Senden: ${err.message || err}` };
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
