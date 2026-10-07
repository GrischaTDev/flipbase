import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { AppNotification } from '../../core/models/webhook.models';
import { SyncStatusService } from '../../core/services/sync-status.service';
import { ToastService } from '../../shared/components/toast/toast.service';
import { HeaderComponent } from './header.component';

const notification: AppNotification = {
  id: 'notification-1',
  type: 'system',
  title: 'Hinweis',
  message: 'Text',
  timestamp: '2026-08-24T10:00:00Z',
  read: false,
  link: '/sales',
};

function erstelleKomponente() {
  const toast = new ToastService();
  const webhookService = {
    markAsRead: vi.fn(async () => ({
      data: { ...notification, read: true },
      error: null,
      reportedBySyncStatus: false,
    })),
    markAllAsRead: vi.fn(async () => ({ data: [], error: null, reportedBySyncStatus: false })),
    clearNotifications: vi.fn(async () => ({ data: [], error: null, reportedBySyncStatus: false })),
  };
  const component = Object.create(HeaderComponent.prototype) as HeaderComponent;
  const favoriteNotifications = {
    markAsRead: vi.fn(async (_id: string) => undefined),
    markAllAsRead: vi.fn(async () => undefined),
    clearNotifications: vi.fn(async () => undefined),
  };
  const feedbackNotifications = {
    markAsRead: vi.fn(async (_id: string) => undefined),
    markAllAsRead: vi.fn(async () => undefined),
    clearNotifications: vi.fn(async () => undefined),
  };
  Object.assign(component, {
    webhookService,
    favoriteNotifications,
    feedbackNotifications,
    toast,
    syncStatus: new SyncStatusService(),
    dialog: { zeigeHinweis: vi.fn(async () => undefined) },
    isNotificationDropdownOpen: signal(true),
    isUpdatingNotifications: signal(false),
  });
  return { component, toast, webhookService, favoriteNotifications, feedbackNotifications };
}

describe('HeaderComponent – Inbox-Aktionen', () => {
  it('markiert Bewertungen ausschließlich im Bewertungsstrom', async () => {
    const { component, feedbackNotifications, favoriteNotifications, webhookService } =
      erstelleKomponente();
    await component.oeffneBenachrichtigung({ ...notification, id: 'marketplace-feedback:7' });
    expect(feedbackNotifications.markAsRead).toHaveBeenCalledExactlyOnceWith(
      'marketplace-feedback:7',
    );
    expect(favoriteNotifications.markAsRead).not.toHaveBeenCalled();
    expect(webhookService.markAsRead).not.toHaveBeenCalled();
  });
  it.each(['onMarkAllNotificationsRead', 'onClearNotifications'] as const)(
    'meldet Teilerfolg bei %s nicht als gemeinsamen Erfolg',
    async (action) => {
      const { component, feedbackNotifications, favoriteNotifications, webhookService, toast } =
        erstelleKomponente();
      const operation =
        action === 'onMarkAllNotificationsRead' ? 'markAllAsRead' : 'clearNotifications';
      feedbackNotifications[operation].mockRejectedValue(new Error('Bewertungen nicht erreichbar'));
      await component[action]();
      expect(favoriteNotifications[operation]).toHaveBeenCalledOnce();
      expect(webhookService[operation]).toHaveBeenCalledOnce();
      expect(toast.toasts()).toHaveLength(1);
      expect(toast.toasts()[0]).toMatchObject({
        type: 'error',
        description: 'Bewertungen nicht erreichbar',
      });
    },
  );
  it('markiert Favoritenmeldungen ausschließlich im berechtigten Marktplatzstrom', async () => {
    const { component, favoriteNotifications, webhookService, toast } = erstelleKomponente();
    await component.oeffneBenachrichtigung({ ...notification, id: 'marketplace:favorite-1' });
    expect(favoriteNotifications.markAsRead).toHaveBeenCalledExactlyOnceWith(
      'marketplace:favorite-1',
    );
    expect(webhookService.markAsRead).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
  });

  it.each(['onMarkAllNotificationsRead', 'onClearNotifications'] as const)(
    'bestätigt %s bei fehlgeschlagener Favoritenaktion nicht als erfolgreich',
    async (action) => {
      const { component, favoriteNotifications, toast } = erstelleKomponente();
      const operation =
        action === 'onMarkAllNotificationsRead' ? 'markAllAsRead' : 'clearNotifications';
      favoriteNotifications[operation].mockRejectedValue(new Error('Favoriten nicht erreichbar'));
      await component[action]();
      expect(toast.toasts()).toHaveLength(1);
      expect(toast.toasts()[0]).toMatchObject({
        type: 'error',
        description: 'Favoriten nicht erreichbar',
      });
      expect(component.isUpdatingNotifications()).toBe(false);
    },
  );

  it('meldet bereits zentral gemeldete allgemeine Fehler nicht erneut', async () => {
    const { component, webhookService, toast, favoriteNotifications } = erstelleKomponente();
    webhookService.markAllAsRead.mockResolvedValue({
      data: [],
      error: new Error('offline'),
      reportedBySyncStatus: true,
    } as never);
    await component.onMarkAllNotificationsRead();
    expect(favoriteNotifications.markAllAsRead).toHaveBeenCalledOnce();
    expect(toast.toasts()).toEqual([]);
  });

  it('öffnet eine Benachrichtigung ohne Erfolgs-Toast', async () => {
    const { component, toast, favoriteNotifications } = erstelleKomponente();
    await component.oeffneBenachrichtigung(notification);
    expect(favoriteNotifications.markAsRead).not.toHaveBeenCalled();
    expect(toast.toasts()).toEqual([]);
    expect(component.isNotificationDropdownOpen()).toBe(false);
  });

  it('meldet den Fehler beim automatischen Gelesen-Markieren sichtbar', async () => {
    const { component, toast, webhookService } = erstelleKomponente();
    webhookService.markAsRead.mockResolvedValue({
      data: null,
      error: new Error('offline'),
      reportedBySyncStatus: false,
    } as never);
    await component.oeffneBenachrichtigung(notification);
    expect(toast.toasts()[0]).toMatchObject({
      type: 'error',
      title: 'Benachrichtigung konnte nicht aktualisiert werden.',
      persistent: true,
    });
  });

  it('bestätigt explizites Gelesen-Markieren und Löschen erst nach Erfolg', async () => {
    const { component, toast, favoriteNotifications } = erstelleKomponente();
    await component.onMarkAllNotificationsRead();
    expect(favoriteNotifications.markAllAsRead).toHaveBeenCalledOnce();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Alle Benachrichtigungen wurden als gelesen markiert.',
    });
    toast.toasts().forEach((meldung) => toast.dismiss(meldung.id));
    await component.onClearNotifications();
    expect(favoriteNotifications.clearNotifications).toHaveBeenCalledOnce();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Benachrichtigungsverlauf wurde gelöscht.',
    });
    expect(component.isUpdatingNotifications()).toBe(false);
  });
});
