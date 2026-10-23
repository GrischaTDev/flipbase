import type { PushWorkerConfig } from './config.ts';
export class EbayOrderObserver {
  private nextRun = 0;
  private readonly config: PushWorkerConfig;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  constructor(config: PushWorkerConfig, fetcher = fetch, now = Date.now) {
    this.config = config;
    this.fetcher = fetcher;
    this.now = now;
  }
  async observe(): Promise<void> {
    if (!this.config.serviceKey || !this.config.observerUrl || this.now() < this.nextRun) return;
    // SQL besitzt Kontolease, gefrorenes Fenster und den Fuenf-Minuten-Zeitplan.
    this.nextRun = this.now() + 5000;
    const response = await this.fetcher(this.config.observerUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      redirect: 'error',
      signal: AbortSignal.timeout(85000),
    });
    if (!response.ok) {
      this.nextRun = this.now() + 300000;
      throw new Error('eBay observer unavailable');
    }
    const body = (await response.json()) as Record<string, unknown>;
    if (!['idle', 'observed'].includes(String(body.status))) {
      this.nextRun = this.now() + 300000;
      throw new Error('Invalid observer response');
    }
  }
}
