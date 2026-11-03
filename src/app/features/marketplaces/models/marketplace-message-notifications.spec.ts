import { describe, expect, it } from 'vitest';
import {
  messageNotificationToInbox,
  parseMessageNotificationFeed,
  parseMessageNotificationSettings,
  messageNotificationCategorySettings,
  vintedNotificationTitles,
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
    expect(parseMessageNotificationSettings(settings, scope)).toEqual({
      ...settings,
      categories: messageNotificationCategorySettings(settings),
    });
    for (const invalid of [
      { ...settings, workspaceId: 'foreign' },
      { ...settings, connectionId: 'foreign' },
      { ...settings, enabled: 'true' },
      { ...settings, version: -1 },
      { ...settings, version: 1.5 },
    ])
      expect(() => parseMessageNotificationSettings(invalid, scope)).toThrow();
  });
  it('liest jede Kategorie einzeln und erfindet bei fehlerhaften Kategorien keine Freigabe', () => {
    const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
    const settings = {
      ...scope,
      enabled: false,
      version: 4,
      categories: {
        messages: false,
        offers: true,
        orders: false,
        shipping: true,
        payments: false,
        feedback: true,
        other: false,
      },
    };
    expect(parseMessageNotificationSettings(settings, scope)).toEqual(settings);
    expect(
      parseMessageNotificationSettings({ ...scope, enabled: false, version: 0 }, scope).categories,
    ).toEqual(Object.fromEntries(Object.keys(settings.categories).map((key) => [key, false])));
    for (const invalid of [
      null,
      { ...settings.categories, other: undefined },
      { ...settings.categories, other: 'true' },
      { ...settings.categories, unknown: true },
      { ...settings.categories, messages: true },
    ])
      expect(() =>
        parseMessageNotificationSettings({ ...settings, categories: invalid }, scope),
      ).toThrow();
  });
  it('führt zum richtigen Konto und Gespräch und erhält den vollständigen Zähler', () => {
    expect(parseMessageNotificationFeed(feed, 'workspace-a').unreadCount).toBe(67);
    expect(messageNotificationToInbox(item)).toMatchObject({
      id: 'marketplace-message:7',
      title: 'Neue Nachricht von Testkontakt',
      message: 'Vinted-Konto: Testkonto.',
      link: '/marketplaces/vinted/messages?connectionId=account-a&conversationId=conversation-a',
    });
  });
  it('unterscheidet einen Preisvorschlag und benötigt keinen privaten Nachrichtentext', () => {
    expect(
      messageNotificationToInbox({ ...item, eventKind: 'offer_request_message', senderName: null })
        .title,
    ).toBe('Neuer Preisvorschlag');
    expect(messageNotificationToInbox({ ...item, senderName: null }).title).toBe('Neue Nachricht');
  });
  it.each(['status_message', 'action_message', 'payment_message'] as const)(
    'führt eine neue %s neutral ins Postfach, ohne den Gesprächspartner als Absender oder einen Verkauf zu behaupten',
    (eventKind) => {
      const system = { ...item, eventKind };
      expect(
        parseMessageNotificationFeed({ ...feed, items: [system] }, 'workspace-a').items,
      ).toEqual([system]);
      expect(messageNotificationToInbox(system)).toMatchObject({
        title: 'Status bei Vinted aktualisiert',
        message: 'Vinted-Konto: Testkonto.',
        link: '/marketplaces/vinted/messages?connectionId=account-a&conversationId=conversation-a',
      });
    },
  );
  it.each(Object.entries(vintedNotificationTitles))(
    'zeigt den belegten Ereignistyp %s mit eigenem Text',
    (notificationKind, title) => {
      const eventKind =
        notificationKind === 'message'
          ? 'message'
          : notificationKind === 'offer_received'
            ? 'offer_request_message'
            : 'status_message';
      const system = { ...item, eventKind, senderName: null, notificationKind };
      const parsed = parseMessageNotificationFeed({ ...feed, items: [system] }, 'workspace-a');
      expect(messageNotificationToInbox(parsed.items[0])).toMatchObject({
        title,
        message: 'Vinted-Konto: Testkonto.',
      });
    },
  );
  it('weist unbekannte Klassifikationen zurück und hält alte null-Werte neutral', () => {
    for (const notificationKind of ['unknown', '__proto__', 'toString', 1, {}])
      expect(() =>
        parseMessageNotificationFeed(
          { ...feed, items: [{ ...item, notificationKind }] },
          'workspace-a',
        ),
      ).toThrow();
    const legacy = parseMessageNotificationFeed(
      { ...feed, items: [{ ...item, eventKind: 'status_message', notificationKind: null }] },
      'workspace-a',
    );
    expect(messageNotificationToInbox(legacy.items[0]).title).toBe(
      'Status bei Vinted aktualisiert',
    );
  });
  it('verweigert Steuer- und Richtungszeichen im Namen statt irreführender Nachrichtentitel', () => {
    for (const senderName of ['Anna\nBestellung storniert', 'Anna\u202e', '\u2066Anna\u2069'])
      expect(() =>
        parseMessageNotificationFeed({ ...feed, items: [{ ...item, senderName }] }, 'workspace-a'),
      ).toThrow();
  });
  it('verweigert widersprüchliche Statusbehauptungen auf einer normalen Chatnachricht', () => {
    for (const [eventKind, notificationKind] of [
      ['message', 'order_completed'],
      ['status_message', 'message'],
      ['status_message', 'offer_received'],
      ['offer_request_message', 'refund_completed'],
    ])
      expect(() =>
        parseMessageNotificationFeed(
          { ...feed, items: [{ ...item, eventKind, notificationKind }] },
          'workspace-a',
        ),
      ).toThrow();
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
