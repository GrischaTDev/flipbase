import { Injectable, inject, signal } from '@angular/core';
import { WebhookService } from './webhook.service';

export interface WebPushSettings {
  enabled: boolean;
  notifyOnShopOrder: boolean;
  notifyOnFulfillment: boolean;
  notifyOnMarginAlert: boolean;
  soundEnabled: boolean;
}

const STORAGE_KEY_PUSH_SETTINGS = 'reflip_web_push_settings';

@Injectable({
  providedIn: 'root',
})
export class WebPushService {
  private readonly webhookService: WebhookService | null = null;

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
  }

  private checkSupportAndPermission(): void {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.isSupported.set(true);
      this.permission.set(Notification.permission as any);
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
    if (typeof window === 'undefined' || !('Notification' in window)) {
      this.permission.set('unsupported');
      return false;
    }

    try {
      const res = await Notification.requestPermission();
      this.permission.set(res as any);
      return res === 'granted';
    } catch {
      return false;
    }
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

    // If native browser Notification API is available and granted:
    if (typeof window !== 'undefined' && 'Notification' in window && currentPerm === 'granted') {
      try {
        const notif = new Notification(title, {
          body: options?.body || 'ReFlip Reselling OS Update',
          icon: options?.icon || '/icons/icon-192.png',
          badge: options?.badge || '/icons/icon-192.png',
          tag: options?.tag || 'reflip-alert',
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
        };

        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  async sendTestNotification(): Promise<boolean> {
    if (this.permission() !== 'granted') {
      const granted = await this.requestPermission();
      if (!granted) return false;
    }

    return this.sendNotification('ReFlip Web Push Test', {
      body: 'Web Push-Benachrichtigungen funktionieren einwandfrei!',
      tag: 'test-push',
    });
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
