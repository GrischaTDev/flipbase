import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { WebhookService } from './webhook.service';
import { Sale, Purchase } from '../models/flipbase.models';

describe('Webhook & Notification Service', () => {
  let webhookService: WebhookService;

  beforeEach(() => {
    const injector = Injector.create({ providers: [] });
    webhookService = runInInjectionContext(injector, () => new WebhookService());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should initialize with default config and system notification', () => {
    const cfg = webhookService.config();
    expect(cfg.notifyOnSale).toBe(true);

    const notifs = webhookService.notifications();
    expect(notifs.length).toBeGreaterThan(0);
    expect(webhookService.unreadCount()).toBe(1);
  });

  it('should update config properly', () => {
    webhookService.updateConfig({
      discordEnabled: true,
      discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc',
    });

    expect(webhookService.config().discordEnabled).toBe(true);
    expect(webhookService.config().discordWebhookUrl).toBe(
      'https://discord.com/api/webhooks/123/abc',
    );
  });

  it('should add notifications and mark all as read', () => {
    webhookService.addNotification({
      type: 'sale',
      title: 'Test Sale',
      message: 'Artikel verkauft für 100 €',
    });

    expect(webhookService.unreadCount()).toBe(2);

    webhookService.markAllAsRead();
    expect(webhookService.unreadCount()).toBe(0);
  });

  it('should send in-app notification when sale occurs', async () => {
    const sampleSale: Sale = {
      inventory_item_id: 'item-test',
      platform_fee: 0,
      shipping_cost: 0,
      packaging_cost: 0,
      other_costs: 0,
      id: 'sale-test-1',
      workspace_id: 'ws-1',
      platform: 'kleinanzeigen',
      sale_price: 150.0,
      net_profit: 50.0,
      roi: 50.0,
      sale_date: '2026-08-18',
      created_at: '2026-08-18',
    };

    const initialCount = webhookService.notifications().length;
    await webhookService.sendSaleNotification(sampleSale, 'Sony PlayStation 4');

    expect(webhookService.notifications().length).toBe(initialCount + 1);
    expect(webhookService.notifications()[0].title).toContain('Sony PlayStation 4');
  });

  it('should send in-app notification when purchase occurs', async () => {
    const samplePurchase: Purchase = {
      id: 'p-1',
      workspace_id: 'ws-1',
      type: 'single',
      title: 'Nintendo Switch OVP',
      purchase_date: '2026-08-18',
      purchase_price: 120.0,
      total_purchase_cost: 120.0,
      cost_allocation_mode: 'even',
      created_at: '2026-08-18',
    };

    const initialCount = webhookService.notifications().length;
    await webhookService.sendPurchaseNotification(samplePurchase);

    expect(webhookService.notifications().length).toBe(initialCount + 1);
    expect(webhookService.notifications()[0].title).toContain('Nintendo Switch OVP');
  });

  it('meldet einen unbekannten Draft-Preis nicht als kostenlosen Einkauf', async () => {
    const purchase: Purchase = {
      id: 'p-unpriced',
      workspace_id: 'ws-1',
      type: 'single',
      title: 'Noch unbepreist',
      purchase_date: '2026-08-31',
      purchase_price: null,
      cost_allocation_mode: 'even',
    };

    await webhookService.sendPurchaseNotification(purchase);

    expect(webhookService.notifications()[0].message).toContain('noch nicht erfasst');
    expect(webhookService.notifications()[0].message).not.toContain('0,00');
  });

  it('meldet eine aufgelöste Discord-HTTP-Fehlerantwort als Fehlschlag', async () => {
    webhookService.config.update((config) => ({
      ...config,
      discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc',
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 429 })),
    );

    const result = await webhookService.sendTestNotification('discord');

    expect(result.success).toBe(false);
    expect(result.message).toContain('HTTP 429');
  });

  it('verlinkt die Meldung auf den Einkauf, nicht auf die Uebersicht', () => {
    // Zu einer Meldung ueber einen bestimmten Einkauf gehoert dieser Einkauf.
    // Vorher zeigte der Link auf '/purchases' - wer schon dort stand, sah beim
    // Klicken gar nichts passieren.
    const samplePurchase: Purchase = {
      id: 'p-42',
      workspace_id: 'ws-1',
      type: 'single',
      title: 'Kamera',
      purchase_date: '2026-08-18',
      purchase_price: 60,
      cost_allocation_mode: 'even',
    };

    webhookService.sendPurchaseNotification(samplePurchase);

    expect(webhookService.notifications()[0].link).toBe('/purchases/p-42');
  });

  it('nennt die Einkaufsart richtig, nicht nur Palette oder Einzelkauf', () => {
    // Vorher unterschied die Meldung nur zwischen Palette und "Einzelkauf" -
    // eine Mystery Box wurde damit als Einzelkauf gemeldet.
    const mysteryBox: Purchase = {
      id: 'p-7',
      workspace_id: 'ws-1',
      type: 'mystery_pack',
      title: '3kg Retoure Mystery',
      purchase_date: '2026-08-20',
      purchase_price: 21.98,
      cost_allocation_mode: 'even',
    };

    webhookService.sendPurchaseNotification(mysteryBox);

    expect(webhookService.notifications()[0].message).toContain('Mystery Box');
    expect(webhookService.notifications()[0].message).not.toContain('Einzelkauf');
  });

  describe('Einzelne Meldung als gelesen markieren', () => {
    // Frueher setzte das Aufklappmenue `notif.read = true` direkt am Objekt.
    // Das Signal erfuhr davon nichts: Der Zaehler an der Glocke blieb stehen,
    // und nach dem naechsten Laden war alles wieder ungelesen.
    it('senkt den Zaehler und laesst die uebrigen Meldungen ungelesen', () => {
      webhookService.addNotification({
        type: 'sale',
        title: 'Erste',
        message: 'Test',
      });
      webhookService.addNotification({
        type: 'sale',
        title: 'Zweite',
        message: 'Test',
      });
      const vorher = webhookService.unreadCount();
      const id = webhookService.notifications()[0].id;

      webhookService.markAsRead(id);

      expect(webhookService.unreadCount()).toBe(vorher - 1);
      expect(webhookService.notifications().find((n) => n.id === id)?.read).toBe(true);
      expect(webhookService.notifications().filter((n) => !n.read).length).toBe(vorher - 1);
    });

    it('aendert nichts, wenn die Meldung schon gelesen ist', () => {
      const id = webhookService.notifications()[0].id;
      webhookService.markAsRead(id);
      const zwischenstand = webhookService.unreadCount();

      webhookService.markAsRead(id);

      expect(webhookService.unreadCount()).toBe(zwischenstand);
    });

    it('laesst eine unbekannte Kennung wirkungslos', () => {
      const vorher = webhookService.unreadCount();

      webhookService.markAsRead('gibt-es-nicht');

      expect(webhookService.unreadCount()).toBe(vorher);
    });
  });
});
