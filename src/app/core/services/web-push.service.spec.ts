import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { WebPushService } from './web-push.service';

describe('WebPushService & Browser Notifications (Chapter 23)', () => {
  let service: WebPushService;

  beforeEach(() => {
    service = new WebPushService();
  });

  it('should initialize with default settings', () => {
    const settings = service.settings();
    expect(settings.enabled).toBe(true);
    expect(settings.notifyOnShopOrder).toBe(true);
    expect(settings.notifyOnFulfillment).toBe(true);
  });

  it('should update push settings and persist', () => {
    service.updateSettings({ notifyOnShopOrder: false });
    expect(service.settings().notifyOnShopOrder).toBe(false);

    service.updateSettings({ notifyOnShopOrder: true });
    expect(service.settings().notifyOnShopOrder).toBe(true);
  });

  it('should trigger shop order notification and update lastNotificationSent signal', () => {
    service.triggerShopOrderNotification('ORD-9988', 'Max Mustermann', 149.99);
    expect(service.lastNotificationSent()).toContain('ORD-9988');
  });

  it('should trigger fulfillment label notification and update lastNotificationSent signal', () => {
    service.triggerFulfillmentNotification('DHL Paket', '00340434123456789012');
    expect(service.lastNotificationSent()).toContain('DHL Paket');
  });
});
