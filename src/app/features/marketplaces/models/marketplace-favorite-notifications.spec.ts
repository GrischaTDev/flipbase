import { describe, expect, it } from 'vitest';
import {
  parseFavoriteNotificationFeed,
  parseFavoriteNotificationSettings,
  favoriteNotificationToInbox,
} from './marketplace-favorite-notifications';

const item = {
  id: '7',
  connectionId: 'account-a',
  accountName: 'Mein Konto',
  observedAt: '2026-10-01T12:00:00Z',
  read: false,
  listings: [{ entryId: 'listing-a', title: 'Schal', previousFavorites: 0, favorites: 2 }],
};
describe('Gespeicherte Favoritenmeldungen', () => {
  it('behält den echten Gesamtzähler jenseits der geladenen Seite', () => {
    const feed = parseFavoriteNotificationFeed(
      { workspaceId: 'workspace-a', items: [item], unreadCount: 67 },
      'workspace-a',
    );
    expect(feed.unreadCount).toBe(67);
    expect(feed.items[0].listings[0].favorites).toBe(2);
  });
  it('verwirft einen Feed aus einem fremden Workspace', () => {
    expect(() =>
      parseFavoriteNotificationFeed(
        { workspaceId: 'other', items: [item], unreadCount: 1 },
        'workspace-a',
      ),
    ).toThrow();
  });
  it.each([null, -1, 1.5, Number.POSITIVE_INFINITY])(
    'verwirft unbekannte oder ungültige Zähler: %s',
    (favorites) => {
      expect(() =>
        parseFavoriteNotificationFeed(
          {
            workspaceId: 'workspace-a',
            items: [{ ...item, listings: [{ ...item.listings[0], favorites }] }],
            unreadCount: 1,
          },
          'workspace-a',
        ),
      ).toThrow();
    },
  );
  it('erstellt einen kontogebundenen Inseratlink und keinen externen Link', () => {
    expect(favoriteNotificationToInbox(item)).toMatchObject({
      id: 'marketplace:7',
      title: 'Artikel wurde favorisiert · Mein Konto',
      message: 'Schal',
      link: '/marketplaces/vinted/listings/account-a/listing-a',
    });
  });
  it('fasst mehrere Inserate in einer Kontoansicht zusammen', () => {
    const inbox = favoriteNotificationToInbox({
      ...item,
      listings: [item.listings[0], { ...item.listings[0], entryId: 'listing-b', title: 'Hose' }],
    });
    expect(inbox.title).toBe('2 Artikel wurden favorisiert · Mein Konto');
    expect(inbox.message).toContain('2 Inserate');
    expect(inbox.link).toBe('/marketplaces/vinted/listings?connectionId=account-a');
  });
  it('prüft Kontozuordnung und Einstellungsfassung', () => {
    const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
    expect(
      parseFavoriteNotificationSettings({ ...scope, enabled: true, version: 0 }, scope),
    ).toEqual({ ...scope, enabled: true, version: 0 });
    expect(() =>
      parseFavoriteNotificationSettings(
        { ...scope, connectionId: 'foreign', enabled: true, version: 0 },
        scope,
      ),
    ).toThrow();
  });
});
