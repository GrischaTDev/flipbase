import type { AppNotification } from './webhook.models';

/** Der erste bestätigte Feed ist Bestand; nur spätere neue, ungelesene Meldungen zählen. */
export class NotificationArrivalTracker {
  private initialized = false;
  private latestTimestamp = Number.NEGATIVE_INFINITY;
  private readonly seenIds = new Set<string>();

  takeNew(notifications: readonly AppNotification[]): readonly AppNotification[] {
    const previousLatest = this.latestTimestamp;
    const arrivals: AppNotification[] = [];
    for (const notification of notifications) {
      const timestamp = Date.parse(notification.timestamp);
      const known = this.seenIds.has(notification.id);
      this.seenIds.add(notification.id);
      if (!Number.isFinite(timestamp)) continue;
      this.latestTimestamp = Math.max(this.latestTimestamp, timestamp);
      if (this.initialized && !known && !notification.read && timestamp >= previousLatest)
        arrivals.push(notification);
    }
    this.initialized = true;
    return arrivals;
  }

  reset(): void {
    this.initialized = false;
    this.latestTimestamp = Number.NEGATIVE_INFINITY;
    this.seenIds.clear();
  }
}
