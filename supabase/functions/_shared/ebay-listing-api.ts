import { EbayError, readNonNegativeNumber, readRecord } from './ebay-api.ts';
import type { EbayConfig } from './ebay-api.ts';
import type { EbayListingDetails, EbayListingUpdate } from './ebay-contracts.ts';
import { hashState } from './ebay-token-encryption.ts';
import {
  requireEbayImageUrl,
  requireEbayListingId,
  requireHttpsImageUrl,
} from './ebay-listing-management.ts';

// Offizieller Vertrag: /develop/api/spec/listing.graphqls (GA 1.0.0, 26.10.2026).
// Keine freie GraphQL-Anfrage aus dem Browser: nur diese festen Operationen und Variablen.
export async function ebayListingGraphql(
  config: EbayConfig,
  token: string,
  query: string,
  variables: Record<string, unknown>,
  fetcher = fetch,
  writing = false,
): Promise<Record<string, unknown>> {
  const failure = writing ? 'save_unconfirmed' : 'provider_unavailable';
  let response: Response;
  try {
    response = await fetcher(
      config.environment === 'sandbox'
        ? 'https://graphqlapi.sandbox.ebay.com/graphql'
        : 'https://graphqlapi.ebay.com/graphql',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new EbayError(failure);
  }
  if (response.status === 401) throw new EbayError('needs_login');
  if (response.status === 403) throw new EbayError('scope_missing');
  if (!response.ok) throw new EbayError(failure);
  let body: Record<string, unknown>;
  try {
    body = readRecord(await response.json());
  } catch {
    throw new EbayError(writing ? 'save_unconfirmed' : 'invalid_response');
  }
  if (Array.isArray(body.errors) && body.errors.length) {
    // Teilantworten können bereits eine Schreibwirkung enthalten. Auch ein
    // zusätzlicher Auth-Fehler darf dann keinen automatischen Neuversuch auslösen.
    if (writing) throw new EbayError('save_unconfirmed');
    const codes = body.errors.map((error) => readRecord(readRecord(error).extensions).code);
    if (codes.includes('UNAUTHENTICATED')) throw new EbayError('needs_login');
    if (codes.includes('FORBIDDEN')) throw new EbayError('scope_missing');
    throw new EbayError('invalid_response');
  }
  if (!body.data || typeof body.data !== 'object') throw new EbayError(failure);
  return readRecord(body.data);
}
const LISTING_FIELDS = `listingId marketplace
  listingTerms { listingFormat lifecycleTerms { listingStatus } }
  sellerProduct { title description images { ebayImageUrl externalImageUrl order } }
  items { itemId sku itemTerms { availability { quantityAvailable }
    pricingTerms { fixedPrice { original { value currency } }
      auctionPrice { startingBidPrice { original { value currency } } } } } }`;
export const EBAY_LISTING_DETAIL_QUERY = `query FlipbaseListing($input: SellerListingsInput!) {
  sellerListings(input: $input) { __typename ... on ListingsSuccess {
    listings { __typename ... on ListingSuccess { listingId listing { ${LISTING_FIELDS} } } }
  } }
}`;
export async function readModernEbayListing(
  config: EbayConfig,
  token: string,
  listingId: string,
  fetcher = fetch,
): Promise<EbayListingDetails> {
  requireEbayListingId(listingId);
  const data = await ebayListingGraphql(
    config,
    token,
    EBAY_LISTING_DETAIL_QUERY,
    { input: { listings: [{ listingId }] } },
    fetcher,
  );
  const output = readRecord(data.sellerListings);
  const results = Array.isArray(output.listings) ? output.listings : [];
  const result = readRecord(results[0]);
  const listing = readRecord(result.listing);
  if (
    output.__typename !== 'ListingsSuccess' ||
    results.length !== 1 ||
    result.__typename !== 'ListingSuccess' ||
    result.listingId !== listingId ||
    listing.listingId !== listingId
  )
    throw new EbayError('listing_not_owned');
  const terms = readRecord(listing.listingTerms);
  if (readRecord(terms.lifecycleTerms).listingStatus !== 'ACTIVE')
    throw new EbayError('listing_not_editable');
  const product = readRecord(listing.sellerProduct);
  const items = Array.isArray(listing.items) ? listing.items.map(readRecord) : [];
  const item = items[0] ?? {};
  const itemTerms = readRecord(item.itemTerms);
  const pricing = readRecord(itemTerms.pricingTerms);
  const price = readRecord(
    readRecord(pricing.fixedPrice ?? readRecord(pricing.auctionPrice).startingBidPrice).original,
  );
  if (
    typeof product.title !== 'string' ||
    typeof product.description !== 'string' ||
    !items.length ||
    typeof listing.marketplace !== 'string'
  )
    throw new EbayError('invalid_response');
  const imageUrls = (Array.isArray(product.images) ? product.images : [])
    .map(readRecord)
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .map((image) => requireHttpsImageUrl(image.ebayImageUrl ?? image.externalImageUrl));
  const details = {
    id: listingId,
    title: product.title,
    description: product.description,
    imageUrls,
    price: readNonNegativeNumber(price.value),
    currency: typeof price.currency === 'string' ? price.currency : null,
    quantity: readNonNegativeNumber(readRecord(itemTerms.availability).quantityAvailable),
    listingType:
      terms.listingFormat === 'FIXED_PRICE'
        ? 'FixedPriceItem'
        : terms.listingFormat === 'AUCTION'
          ? 'Chinese'
          : null,
    url: `${config.environment === 'sandbox' ? 'https://sandbox.ebay.com' : 'https://www.ebay.de'}/itm/${listingId}`,
    imageUrl: imageUrls[0] ?? null,
    watchCount: null,
    hasVariations: items.length > 1,
    marketplace: listing.marketplace,
    itemSku: typeof item.sku === 'string' ? item.sku : null,
  };
  return { ...details, revision: await hashState(JSON.stringify(details)) };
}
export const EBAY_LISTING_UPDATE_QUERY = `mutation FlipbaseUpdateListing($input: UpdateListingInput!) {
  updateListing(input: $input) { __typename
    ... on UpdateListingSuccess { listing { listingId } warnings { warningCode } }
    ... on UpdateListingValidationError { errorCode }
  }
}`;
export async function reviseModernEbayListing(
  config: EbayConfig,
  token: string,
  listing: EbayListingDetails,
  update: EbayListingUpdate,
  fetcher = fetch,
) {
  if (listing.revision !== update.expectedRevision) throw new EbayError('listing_changed');
  if (
    !listing.marketplace ||
    !['FixedPriceItem', 'Chinese'].includes(listing.listingType ?? '') ||
    (update.price !== undefined &&
      (listing.hasVariations || listing.listingType !== 'FixedPriceItem'))
  )
    throw new EbayError('listing_not_editable');
  for (const url of update.imageUrls ?? [])
    if (!listing.imageUrls.includes(url)) requireEbayImageUrl(url);
  const { expectedRevision: _revision, price, ...product } = update;
  const data = await ebayListingGraphql(
    config,
    token,
    EBAY_LISTING_UPDATE_QUERY,
    {
      input: {
        listingIdentifier: { listingId: listing.id },
        marketplace: listing.marketplace,
        ...(Object.keys(product).length ? { product } : {}),
        ...(price !== undefined
          ? {
              listingItems: {
                items: [
                  {
                    ...(listing.itemSku ? { sku: listing.itemSku } : {}),
                    itemTerms: { pricingTerms: { fixedPrice: price.toFixed(2) } },
                  },
                ],
              },
            }
          : {}),
      },
    },
    fetcher,
    true,
  );
  const result = readRecord(data.updateListing);
  if (result.__typename === 'UpdateListingValidationError')
    throw new EbayError('revision_rejected');
  if (
    result.__typename !== 'UpdateListingSuccess' ||
    readRecord(result.listing).listingId !== listing.id
  )
    throw new EbayError('save_unconfirmed');
  return {
    ok: true,
    warning:
      Array.isArray(result.warnings) && result.warnings.length
        ? 'eBay hat Hinweise gemeldet. Prüfe das aktualisierte Inserat bei eBay.'
        : null,
  };
}
