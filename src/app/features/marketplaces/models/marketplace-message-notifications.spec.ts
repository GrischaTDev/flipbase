import { describe, expect, it } from 'vitest';
import {
  messageNotificationToInbox,
  parseMessageNotificationFeed,
  parseMessageNotificationSettings,
  type MessageNotification,
} from './marketplace-message-notifications';
const item: MessageNotification = {
  id: '7',
  connectionId: 'account-a',
  conversationId: 'conversation-a',
  accountName: 'Testkonto',
  senderName: 'Testkontakt',
  eventKind: 'message',
  observedAt: '2026-10-08T12:00:00Z',
  read: false,
};
const feed = { workspaceId: 'workspace-a', items: [item], unreadCount: 67 };
describe('Gespeicherte Nachrichteneingänge', () => {
  it('prüft Einstellung, Konto und Version an der Antwortgrenze', () => {
    const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
    const settings = { ...scope, enabled: true, version: 0 };
    expect(parseMessageNotificationSettings(settings, scope)).toEqual(settings);
    for (const invalid of [
      { ...settings, workspaceId: 'foreign' },
      { ...settings, connectionId: 'foreign' },
      { ...settings, enabled: 'true' },
      { ...settings, version: -1 },
      { ...settings, version: 1.5 },
    ])
      expect(() => parseMessageNotificationSettings(invalid, scope)).toThrow();
  });
  it('führt zum richtigen Konto und Gespräch und erhält den vollständigen Zähler', () => {
    expect(parseMessageNotificationFeed(feed, 'workspace-a').unreadCount).toBe(67);
    expect(messageNotificationToInbox(item)).toMatchObject({
      id: 'marketplace-message:7',
      title: 'Neue Nachricht · Testkonto',
      message: 'Nachricht von Testkontakt.',
      link: '/marketplaces/vinted/messages?connectionId=account-a&conversationId=conversation-a',
    });
  });
  it('unterscheidet einen Preisvorschlag und benötigt keinen privaten Nachrichtentext', () => {
    expect(
      messageNotificationToInbox({ ...item, eventKind: 'offer_request_message', senderName: null })
        .message,
    ).toBe('Neuer Preisvorschlag.');
  });
  it.each(['status_message', 'action_message', 'payment_message'] as const)(
    'führt eine neue %s neutral ins Postfach, ohne den Gesprächspartner als Absender oder einen Verkauf zu behaupten',
    (eventKind) => {
      const system = { ...item, eventKind };
      expect(
        parseMessageNotificationFeed({ ...feed, items: [system] }, 'workspace-a').items,
      ).toEqual([system]);
      expect(messageNotificationToInbox(system)).toMatchObject({
        title: 'Neue Postfachmeldung · Testkonto',
        message: 'Neue Meldung im Vinted-Postfach.',
        link: '/marketplaces/vinted/messages?connectionId=account-a&conversationId=conversation-a',
      });
    },
  );
  it('verweigert fremden Scope, doppelte IDs, zu kleine Zähler und unbekannte Ereignisse', () => {
    for (const invalid of [
      { ...feed, workspaceId: 'foreign' },
      { ...feed, items: [item, item] },
      { ...feed, unreadCount: 0 },
      { ...feed, items: [{ ...item, eventKind: 'system' }] },
      { ...feed, items: [{ ...item, conversationId: null }] },
      { ...feed, items: [{ ...item, observedAt: 'bad' }] },
      { ...feed, unreadCount: -1 },
    ])
      expect(() => parseMessageNotificationFeed(invalid, 'workspace-a')).toThrow();
  });
});
