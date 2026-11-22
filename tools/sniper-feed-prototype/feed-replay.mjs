const eligiblePublicStates = new Set(['public', 'sold', 'unavailable']);
const recentSampleLimit = 128;

function words(text) {
  return (
    (text ?? '')
      .normalize('NFKC')
      .toLocaleLowerCase('de-DE')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function includesFilter(filter, value) {
  return !filter?.length || filter.includes(value);
}

function matchesSellerCountry(item, countries, includeUnknown = false) {
  if (!countries?.length) return true;
  if (item.sellerCountrySource !== 'confirmed') return includeUnknown;
  return countries.includes(item.sellerCountry);
}

export function matchesFeed(item, feed) {
  if (
    feed.unsupported?.length ||
    item.market !== feed.market ||
    !includesFilter(feed.brandIds, item.brandId) ||
    !includesFilter(feed.catalogIds, item.catalogId) ||
    !includesFilter(feed.sizeIds, item.sizeId) ||
    !includesFilter(feed.conditionIds, item.conditionId) ||
    !includesFilter(feed.colorIds, item.colorId) ||
    !includesFilter(feed.materialIds, item.materialId) ||
    (feed.currency && item.currency !== feed.currency) ||
    (feed.minPrice != null && !(item.price >= feed.minPrice)) ||
    (feed.maxPrice != null && !(item.price <= feed.maxPrice)) ||
    !matchesSellerCountry(item, feed.sellerCountries, feed.includeUnknownSellerCountry)
  )
    return false;

  const titleWords = new Set(words(item.title));
  if (words(feed.excluded).some((word) => titleWords.has(word))) return false;
  const terms = words(feed.terms);
  return (
    !terms.length ||
    (feed.termMode === 'any'
      ? terms.some((term) => titleWords.has(term))
      : terms.every((term) => titleWords.has(term)))
  );
}

/** Verwendet eine gemeinsame Quelle nur bei einem vollständigen, belegten Ausschnitt. */
export async function collectFeedBatch(feeds, readSource) {
  const byMarket = Map.groupBy(
    feeds.filter((feed) => !feed.paused && !feed.unsupported?.length),
    (feed) => feed.market,
  );
  const result = new Map();
  for (const [market, members] of byMarket) {
    const shared = members.length > 1 ? await readSource({ market }) : null;
    const preciseSources = new Map();
    for (const feed of members) {
      let response = shared;
      if (!response?.caughtUp) {
        const { source } = feed;
        const key = source.key;
        const selection = preciseSources.get(key) ?? (await readSource({ market, filter: source }));
        preciseSources.set(key, selection);
        response = selection;
      }
      result.set(feed.id, {
        items: response.items.filter((item) => matchesFeed(item, feed)),
        caughtUp: response.caughtUp,
      });
    }
  }
  return result;
}

export class FeedReplay {
  #items = new Map();
  #observations = new Map();
  #feeds = new Map();
  #intents = new Map();
  #samples = new Map();

  setFeed(feed) {
    this.#feeds.set(feed.id, structuredClone(feed));
  }

  readFolder(folder = null) {
    return [...this.#feeds.values()].filter((feed) => folder === null || feed.folder === folder);
  }

  items(feedId) {
    const feed = this.#feeds.get(feedId);
    if (!feed) return [];
    return [...this.#items.values()]
      .filter((item) => matchesFeed(item, feed))
      .sort((a, b) => b.firstSeenAt - a.firstSeenAt || a.id.localeCompare(b.id))
      .map((item) => ({ ...item }));
  }

  markCoverage(market, caughtUp) {
    this.#observations.set(market, caughtUp);
  }

  coverage(market) {
    return this.#observations.get(market) ?? false;
  }

  observe(event) {
    const key = this.#itemKey(event.market, event.id);
    const previous = this.#items.get(key);
    if (previous && event.observedAt <= previous.observedAt) return;
    if (
      previous &&
      eligiblePublicStates.has(previous.state) &&
      !eligiblePublicStates.has(event.state)
    )
      return;

    const item = {
      ...previous,
      ...event,
      firstSeenAt: previous?.firstSeenAt ?? event.observedAt,
      firstPreviewAt:
        previous?.firstPreviewAt ?? (event.state === 'preview' ? event.observedAt : null),
      firstPublicAt:
        previous?.firstPublicAt ?? (event.state === 'public' ? event.observedAt : null),
    };
    this.#items.set(key, item);
    if (
      event.state === 'public' &&
      item.firstPreviewAt !== null &&
      previous?.firstPublicAt == null
    ) {
      const duration = event.observedAt - item.firstPreviewAt;
      if (duration > 0 && duration <= 90_000) {
        const samples = this.#samples.get(event.market) ?? [];
        this.#samples.set(event.market, [...samples, duration].slice(-recentSampleLimit));
      }
    }
  }

  displayState(market, id, now) {
    const item = this.#items.get(this.#itemKey(market, id));
    if (!item) return { state: 'unknown', remainingMs: null };
    if (item.state !== 'preview') return { state: item.state, remainingMs: null };
    const samples = [...(this.#samples.get(market) ?? [])].sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    const remainingMs = samples.length >= 5 ? item.firstPreviewAt + median - now : 0;
    return { state: 'preview', remainingMs: remainingMs > 0 ? remainingMs : null };
  }

  armPurchase({ market, id, account, currency, maxTotal, expiresAt, sellerCountries = [] }) {
    const listing = this.#itemKey(market, id);
    const key = JSON.stringify([account, listing]);
    if (this.#intents.has(key)) return key;
    if (
      !account ||
      !/^[A-Z]{3}$/.test(currency) ||
      !Number.isSafeInteger(maxTotal) ||
      maxTotal <= 0 ||
      !Number.isFinite(expiresAt)
    ) {
      throw new Error('Kaufkonto und Gesamtpreisgrenze fehlen.');
    }
    this.#intents.set(key, {
      listing,
      account,
      currency,
      maxTotal,
      expiresAt,
      sellerCountries: [...sellerCountries],
      state: 'waiting',
    });
    return key;
  }

  async checkPurchase(key, now, buy) {
    const intent = this.#intents.get(key);
    if (intent?.state !== 'waiting') return intent?.state;
    const item = this.#items.get(intent.listing);
    if (now >= intent.expiresAt || item?.state === 'sold' || item?.state === 'unavailable') {
      intent.state = 'expired';
    } else if (item?.state === 'public' && item.canBuy === true && item.priceVerified === true) {
      if (intent.sellerCountries.length && item.sellerCountrySource !== 'confirmed')
        return 'waiting';
      if (
        item.currency !== intent.currency ||
        !Number.isSafeInteger(item.total) ||
        item.total <= 0 ||
        item.total > intent.maxTotal ||
        !matchesSellerCountry(item, intent.sellerCountries)
      ) {
        intent.state = 'review';
      } else {
        intent.state = 'submitted';
        try {
          const outcome = await buy({
            id: item.id,
            market: item.market,
            account: intent.account,
            total: item.total,
            key,
          });
          intent.state = outcome?.orderId ? 'purchased' : 'unknown';
          intent.orderId = outcome?.orderId;
        } catch {
          intent.state = 'unknown';
        }
      }
    }
    return intent.state;
  }

  purchaseHistory() {
    return [...this.#intents.values()]
      .filter((intent) => intent.state === 'purchased')
      .map((x) => ({ ...x }));
  }

  reconcilePurchase(key, orderId) {
    const intent = this.#intents.get(key);
    if (intent?.state === 'unknown' && typeof orderId === 'string' && orderId) {
      intent.orderId = orderId;
      intent.state = 'purchased';
    }
    return intent?.state;
  }

  #itemKey(market, id) {
    return JSON.stringify([market, id]);
  }
}
