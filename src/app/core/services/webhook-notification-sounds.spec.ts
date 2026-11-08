import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { NotificationSoundService } from './notification-sound.service';
import { WebhookService } from './webhook.service';
import type { AppNotificationType } from '../models/webhook.models';

describe('Unabhängige Benachrichtigungstöne', () => {
  it.each([
    { general: true, sale: true, expected: 'sale' },
    { general: true, sale: false, expected: 'general' },
    { general: false, sale: true, expected: 'sale' },
    { general: false, sale: false, expected: null },
  ])(
    'spielt für einen gemischten Batch höchstens einen aktivierten Ton ($general/$sale)',
    ({ general, sale, expected }) => {
      const play = vi.fn(() => true);
      const injector = Injector.create({
        providers: [{ provide: NotificationSoundService, useValue: { play } }],
      });
      try {
        const service = runInInjectionContext(injector, () => new WebhookService());
        service.config.update((config) => ({
          ...config,
          soundEnabled: general,
          saleSoundEnabled: sale,
        }));
        service.playNotificationSound(['alert', 'sale', 'sale', 'system']);
        if (expected === null) expect(play).not.toHaveBeenCalled();
        else {
          expect(play).toHaveBeenCalledExactlyOnceWith(expected);
        }
        expect(service.notifications()).toEqual([]);
      } finally {
        injector.destroy();
      }
    },
  );

  it.each([
    { general: false, sale: false, type: 'sale', expected: null },
    { general: false, sale: true, type: 'sale', expected: 'sale' },
    { general: true, sale: false, type: 'sale', expected: null },
    { general: true, sale: true, type: 'sale', expected: 'sale' },
    { general: false, sale: true, type: 'alert', expected: null },
    { general: true, sale: false, type: 'alert', expected: 'general' },
    { general: true, sale: true, type: 'purchase', expected: 'general' },
    { general: true, sale: true, type: 'system', expected: 'general' },
  ])('beachtet beide Schalter für $type ($general/$sale)', ({ general, sale, type, expected }) => {
    const play = vi.fn(() => true);
    const injector = Injector.create({
      providers: [{ provide: NotificationSoundService, useValue: { play } }],
    });
    try {
      const service = runInInjectionContext(injector, () => new WebhookService());
      service.config.update((config) => ({
        ...config,
        soundEnabled: general,
        saleSoundEnabled: sale,
      }));

      service.addNotification({ type: type as AppNotificationType, title: 'Neu', message: 'Test' });

      expect(service.notifications()).toHaveLength(1);
      expect(service.unreadCount()).toBe(1);
      if (expected === null) expect(play).not.toHaveBeenCalled();
      else {
        expect(play).toHaveBeenCalledOnce();
        expect(play).toHaveBeenCalledWith(expected);
      }
    } finally {
      injector.destroy();
    }
  });
});
