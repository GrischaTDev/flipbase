import type { VintedAccountListPage } from '../models/vinted-account-list';

interface ListVersion {
  readonly key: string;
  readonly freshness: string;
}

const firstPageLifetime = 60_000;
const maxRememberedPages = 12;

/** Kurzzeitige Einstiegseiten je geöffnetem Vinted-Bereich. */
export class VintedListFirstPages {
  private readonly pages = new Map<
    string,
    { readonly freshness: string; readonly expiresAt: number; readonly page: VintedAccountListPage }
  >();

  get({ key, freshness }: ListVersion): VintedAccountListPage | null {
    const cached = this.pages.get(key);
    if (!cached) return null;
    if (cached.freshness === freshness && cached.expiresAt > Date.now()) return cached.page;
    this.pages.delete(key);
    return null;
  }

  remember({ key, freshness }: ListVersion, page: VintedAccountListPage): void {
    this.pages.delete(key);
    this.pages.set(key, { freshness, expiresAt: Date.now() + firstPageLifetime, page });
    if (this.pages.size <= maxRememberedPages) return;
    const oldestKey = this.pages.keys().next().value;
    if (oldestKey !== undefined) this.pages.delete(oldestKey);
  }

  forget(key: string): void {
    this.pages.delete(key);
  }

  clear(): void {
    this.pages.clear();
  }
}
