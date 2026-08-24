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
  Object.assign(component, {
    webhookService,
    toast,
    syncStatus: new SyncStatusService(),
    dialog: { zeigeHinweis: vi.fn(async () => undefined) },
    isNotificationDropdownOpen: signal(true),
    isUpdatingNotifications: signal(false),
  });
  return { component, toast, webhookService };
}

describe('HeaderComponent – Inbox-Aktionen', () => {
  it('öffnet eine Benachrichtigung ohne Erfolgs-Toast', async () => {
    const { component, toast } = erstelleKomponente();
    await component.oeffneBenachrichtigung(notification);
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
    const { component, toast } = erstelleKomponente();
    await component.onMarkAllNotificationsRead();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Alle Benachrichtigungen wurden als gelesen markiert.',
    });
    toast.toasts().forEach((meldung) => toast.dismiss(meldung.id));
    await component.onClearNotifications();
    expect(toast.toasts()[0]).toMatchObject({
      type: 'success',
      title: 'Benachrichtigungsverlauf wurde gelöscht.',
    });
    expect(component.isUpdatingNotifications()).toBe(false);
  });
});
