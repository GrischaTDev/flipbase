import { describe, expect, it } from 'vitest';
import {
  feedbackNotificationToInbox,
  parseFeedbackNotificationFeed,
} from './marketplace-feedback-notifications';

const item = {
  id: '7',
  connectionId: 'account-a',
  accountName: 'Maike Vintage',
  observedAt: '2026-10-07T12:00:00Z',
  read: false,
  authorName: 'anna',
  rating: 5,
  isAutomatic: false,
};
const feed = { workspaceId: 'workspace-a', items: [item], unreadCount: 67 };
describe('Gespeicherte Bewertungsmeldungen', () => {
  it('behält den vollständigen Zähler und führt zur Bewertung des richtigen Kontos', () => {
    expect(parseFeedbackNotificationFeed(feed, 'workspace-a').unreadCount).toBe(67);
    expect(feedbackNotificationToInbox(item)).toMatchObject({
      id: 'marketplace-feedback:7',
      title: 'Neue Bewertung · Maike Vintage',
      message: 'Bewertung von anna · 5 von 5 Sternen.',
      link: '/marketplaces/vinted/profile?connectionId=account-a#reviews',
    });
  });
  it('unterscheidet automatische Meldungen und lässt fehlende Angaben offen', () => {
    expect(feedbackNotificationToInbox({ ...item, isAutomatic: true }).message).toContain(
      'Automatische Vinted-Bewertung',
    );
    const unknown = { ...item, authorName: null, rating: null, isAutomatic: null };
    expect(
      parseFeedbackNotificationFeed({ ...feed, items: [unknown] }, 'workspace-a').items[0],
    ).toEqual(unknown);
    expect(feedbackNotificationToInbox(unknown).message).toBe('Neue Vinted-Bewertung.');
  });
  it.each([
    { ...feed, workspaceId: 'foreign' },
    { ...feed, items: [item, item] },
    { ...feed, unreadCount: 0 },
    { ...feed, items: [{ ...item, rating: 6 }] },
    { ...feed, items: [{ ...item, rating: 1.5 }] },
    { ...feed, items: [{ ...item, isAutomatic: 'false' }] },
    { ...feed, items: [{ ...item, observedAt: 'invalid' }] },
    { ...feed, items: [{ ...item, authorName: '<invalid>\n' }] },
  ])('verwirft fremde, doppelte oder ungültige Antworten', (response) => {
    expect(() => parseFeedbackNotificationFeed(response, 'workspace-a')).toThrow();
  });
});
