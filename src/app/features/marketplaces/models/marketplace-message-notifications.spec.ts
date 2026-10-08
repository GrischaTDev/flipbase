import { describe, expect, it } from 'vitest';
import {
  messageNotificationToInbox,
  parseMessageNotificationFeed,
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
