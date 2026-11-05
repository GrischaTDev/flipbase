import type { VintedAccountImport } from './vinted-account-import.ts';
import type { VintedPublicationVersion } from './vinted-publication-age.ts';
import { parseVintedListingCurrentContent } from './vinted-listing-contracts.ts';
import type { VintedListingCurrentContent } from '../../../supabase/functions/_shared/marketplace-listing-contracts.d.ts';

/** Aktualisiert Artikeldetails im Kontoabgleich; der Editor liest danach nur die Datenbank. */
export async function syncVintedListingDetails(
  snapshot: VintedAccountImport,
  previous: readonly VintedPublicationVersion[],
  read: (externalId: string) => Promise<VintedListingCurrentContent>,
  authorize: () => Promise<void>,
  now: () => number = Date.now,
): Promise<void> {
  const saved = new Map(previous.map((entry) => [entry.externalId, entry]));
  const observedAt = snapshot.observedAt;
  const observedTime = Date.parse(observedAt);
  const candidates = [];
  for (const entry of snapshot.entries) {
    if (entry.kind !== 'publication') continue;
    const cached = saved.get(entry.externalId);
    if (cached) {
      Object.assign(entry.body, {
        ...(cached.listingContent ? { listingContent: cached.listingContent } : {}),
        listingDetailsReadAt: cached.listingDetailsReadAt ?? null,
        listingDetailsSourceUpdatedAt: cached.listingDetailsSourceUpdatedAt ?? null,
        listingDetailsAttemptedAt: cached.listingDetailsAttemptedAt ?? null,
      });
    }
    const content = cached?.listingContent;
    const sourceUpdatedAt = entry.body['listingSourceUpdatedAt'];
    const readAt = Date.parse(cached?.listingDetailsReadAt ?? '');
    const changed =
      content &&
      (entry.body['title'] !== content.title ||
        (typeof entry.body['price'] === 'number' &&
          Math.round(entry.body['price'] * 100) !== content.priceCents) ||
        (entry.body['textState'] === 'loaded' && entry.body['text'] !== content.description));
    const stale = sourceUpdatedAt
      ? sourceUpdatedAt !== cached?.listingDetailsSourceUpdatedAt
      : !Number.isFinite(readAt) || observedTime - readAt >= 24 * 60 * 60 * 1000;
    const attemptedAt = Date.parse(cached?.listingDetailsAttemptedAt ?? '');
    if (
      (!content || changed || stale) &&
      (!Number.isFinite(attemptedAt) || observedTime - attemptedAt >= 60 * 1000)
    )
      candidates.push({ entry, attemptedAt, sourceUpdatedAt });
  }
  // Alte Versuche zuerst: ein nicht lesbares Inserat darf die übrigen nicht blockieren.
  candidates.sort((left, right) => (left.attemptedAt || 0) - (right.attemptedAt || 0));
  const startedAt = now();
  for (const { entry, sourceUpdatedAt } of candidates.slice(0, 3)) {
    if (now() - startedAt >= 45_000) break;
    await authorize();
    entry.body['listingDetailsAttemptedAt'] = observedAt;
    try {
      const listing = parseVintedListingCurrentContent(
        await read(entry.externalId),
        snapshot.identity.id,
        entry.externalId,
      );
      await authorize();
      Object.assign(entry.body, {
        listingContent: listing.content,
        listingDetailsReadAt: observedAt,
        listingDetailsSourceUpdatedAt: sourceUpdatedAt ?? null,
      });
    } catch {
      // Rechteverlust bricht ab; Lesefehler erhalten die letzte bestätigte Aufnahme.
      await authorize();
    }
  }
}
