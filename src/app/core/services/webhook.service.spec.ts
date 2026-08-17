import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { WebhookService } from './webhook.service';
import { Sale, Purchase } from '../models/reflip.models';

describe('Webhook & Notification Service', () => {
  let webhookService: WebhookService;

  beforeEach(() => {
    webhookService = new WebhookService();
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
    expect(webhookService.config().discordWebhookUrl).toBe('https://discord.com/api/webhooks/123/abc');
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
});
