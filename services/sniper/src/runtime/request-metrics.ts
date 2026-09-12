import type { FetchLike } from '../vinted/session.js';

/** Das Zeitfenster zaehlt reale Versuche, einschliesslich Aufwaermung und Wiederholungen. */
export class RequestMetrics {
  private events: { at: number; rejected: boolean }[] = [];
  constructor(private readonly now: () => number = Date.now) {}

  wrap(fetchFn: FetchLike): FetchLike {
    return async (input, init) => {
      const event = { at: this.now(), rejected: false };
      this.events.push(event);
      const response = await fetchFn(input, init);
      event.rejected = response.status === 403 || response.status === 429;
      return response;
    };
  }

  snapshot(): { requests: number; rejected: number } {
    this.events = this.events.filter((event) => event.at > this.now() - 60_000);
    return {
      requests: this.events.length,
      rejected: this.events.filter((event) => event.rejected).length,
    };
  }
}
