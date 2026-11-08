import { describe, expect, it } from 'vitest';
import type { AppNotification } from './webhook.models';
import { NotificationArrivalTracker } from './notification-arrival-tracker';

const notification = (id: string, timestamp: string, read = false): AppNotification => ({
  id,
  timestamp,
  read,
  type: 'alert',
  title: id,
  message: id,
});
const earlier = '2026-11-08T08:00:00Z';
const now = '2026-11-08T08:01:00Z';
const later = '2026-11-08T08:02:00Z';

describe('Neue Meldungen im geladenen Benachrichtigungsfeed', () => {
  it('behandelt den ersten erfolgreichen Abruf als stummen Bestand', () => {
    const tracker = new NotificationArrivalTracker();
    expect(tracker.takeNew([notification('existing', now)])).toEqual([]);
    expect(tracker.takeNew([notification('new', later), notification('existing', now)])).toEqual([
      notification('new', later),
    ]);
  });

  it('erkennt neue Meldungen auch nach einem anfangs leeren Feed', () => {
    const tracker = new NotificationArrivalTracker();
    expect(tracker.takeNew([])).toEqual([]);
    expect(tracker.takeNew([notification('new', now)])).toEqual([notification('new', now)]);
  });

  it('spielt bei Lesen, Aktualisieren und erneutem Auftauchen keine bekannte Meldung nach', () => {
    const tracker = new NotificationArrivalTracker();
    tracker.takeNew([notification('existing', now)]);
    expect(tracker.takeNew([notification('existing', now, true)])).toEqual([]);
    expect(tracker.takeNew([])).toEqual([]);
    expect(tracker.takeNew([notification('existing', later)])).toEqual([]);
  });

  it('ignoriert nachrückende ältere Historie und bereits gelesene neue IDs', () => {
    const tracker = new NotificationArrivalTracker();
    tracker.takeNew([notification('existing', now)]);
    expect(
      tracker.takeNew([
        notification('old-page', earlier),
        notification('read-elsewhere', later, true),
      ]),
    ).toEqual([]);
    expect(tracker.takeNew([notification('read-elsewhere', later)])).toEqual([]);
  });

  it('erkennt einen ungeordneten Batch und neue IDs mit gleichem Zeitstempel genau einmal', () => {
    const tracker = new NotificationArrivalTracker();
    tracker.takeNew([notification('existing', now)]);
    const batch = [notification('newer', later), notification('same-time', now)];
    expect(tracker.takeNew(batch)).toEqual(batch);
    expect(tracker.takeNew(batch)).toEqual([]);
  });

  it('verwirft den bisherigen Bestand beim Kontextwechsel', () => {
    const tracker = new NotificationArrivalTracker();
    tracker.takeNew([notification('workspace-a', now)]);
    tracker.reset();
    expect(tracker.takeNew([notification('workspace-b', later)])).toEqual([]);
  });
});
