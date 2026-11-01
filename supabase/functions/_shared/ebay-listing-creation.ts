import { EbayError, readNonNegativeNumber, readRecord } from './ebay-api.ts';
import type { EbayConfig } from './ebay-api.ts';
import { ebayListingGraphql } from './ebay-listing-api.ts';
import { requireEbayImageUrl } from './ebay-listing-management.ts';
import type { EbayListingCheck, EbayListingDraft } from './ebay-listing-creation-contracts.ts';

export function validateEbayDraft(value: unknown): EbayListingDraft {
  const draft = readRecord(value);
  for (const name of [
    'categoryId',
    'conditionId',
    'paymentPolicyId',
    'fulfillmentPolicyId',
    'returnPolicyId',
  ])
    if (typeof draft[name] !== 'string' || !/^\d{1,30}$/.test(draft[name]))
      throw new EbayError('invalid_request');
  for (const [name, maximum] of [
    ['title', 80],
    ['description', 20000],
    ['location', 100],
  ] as const)
    if (
      typeof draft[name] !== 'string' ||
      !draft[name].trim() ||
      draft[name].length > maximum ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(draft[name])
    )
      throw new EbayError('invalid_request');
  if (
    typeof draft.key !== 'string' ||
    !/^[a-f0-9]{32}$/.test(draft.key) ||
    typeof draft.price !== 'number' ||
    !Number.isFinite(draft.price) ||
    draft.price <= 0 ||
    draft.price > 1000000 ||
    Math.abs(draft.price * 100 - Math.round(draft.price * 100)) > 0.00001 ||
    typeof draft.quantity !== 'number' ||
    !Number.isInteger(draft.quantity) ||
    draft.quantity < 1 ||
    draft.quantity > 1000 ||
    typeof draft.postalCode !== 'string' ||
    !/^\d{5}$/.test(draft.postalCode) ||
    !Array.isArray(draft.imageUrls) ||
    draft.imageUrls.length < 1 ||
    draft.imageUrls.length > 24 ||
    new Set(draft.imageUrls).size !== draft.imageUrls.length ||
    !Array.isArray(draft.aspects) ||
    draft.aspects.length > 80
  )
    throw new EbayError('invalid_request');
  draft.imageUrls.forEach(requireEbayImageUrl);
  for (const value of draft.aspects) {
    const aspect = readRecord(value);
    if (
      typeof aspect.name !== 'string' ||
      !aspect.name.trim() ||
      aspect.name.length > 100 ||
      !Array.isArray(aspect.values) ||
      !aspect.values.length ||
      aspect.values.length > 30 ||
      aspect.values.some(
        (value) => typeof value !== 'string' || !value.trim() || value.length > 200,
      )
    )
      throw new EbayError('invalid_request');
  }
  if (new Set(draft.aspects.map((aspect) => readRecord(aspect).name)).size !== draft.aspects.length)
    throw new EbayError('invalid_request');
  // Nur die ausdrücklich unterstützten Felder weitergeben, keine freien Anbieterobjekte.
  return {
    key: draft.key,
    title: String(draft.title),
    description: String(draft.description),
    price: draft.price,
    quantity: draft.quantity,
    categoryId: String(draft.categoryId),
    conditionId: String(draft.conditionId),
    postalCode: draft.postalCode,
    location: String(draft.location),
    paymentPolicyId: String(draft.paymentPolicyId),
    fulfillmentPolicyId: String(draft.fulfillmentPolicyId),
    returnPolicyId: String(draft.returnPolicyId),
    imageUrls: draft.imageUrls as string[],
    aspects: draft.aspects.map((value) => {
      const aspect = readRecord(value);
      return { name: String(aspect.name), values: aspect.values as string[] };
    }),
  };
}
export const EBAY_CREATE_LISTING_QUERY = `mutation FlipbaseCreateListing($input: CreateListingInput!) {
  createListing(input: $input) { __typename
    ... on CreateListingSuccess { listing { listingId } listingFees { listingFeeType feeAmount { value currency } } warnings { warningMessage } }
    ... on CreateListingValidationSuccess { listingFees { listingFeeType feeAmount { value currency } } warnings { warningMessage } }
    ... on CreateListingValidationError { violations { violationDescription } warnings { warningMessage } }
  }
}`;
export async function createEbayListing(
  config: EbayConfig,
  token: string,
  draft: EbayListingDraft,
  execute: boolean,
  fetcher = fetch,
): Promise<EbayListingCheck> {
  const data = await ebayListingGraphql(
    config,
    token,
    EBAY_CREATE_LISTING_QUERY,
    {
      input: {
        idempotencyKey: draft.key,
        sku: `flipbase-${draft.key}`,
        marketplace: 'EBAY_DE',
        options: { operationMode: execute ? 'EXECUTE' : 'VALIDATE' },
        listingItems: {
          items: [
            {
              sku: `flipbase-${draft.key}`,
              itemTerms: {
                availability: { quantityAvailable: draft.quantity },
                pricingTerms: { fixedPrice: draft.price.toFixed(2) },
              },
            },
          ],
        },
        product: {
          title: draft.title,
          description: draft.description,
          imageUrls: draft.imageUrls,
          categories: { primaryCategoryId: draft.categoryId },
          itemCondition: { conditionId: draft.conditionId },
          aspects: draft.aspects,
        },
        listingTerms: {
          listingFormat: 'FIXED_PRICE',
          lifecycleTerms: { listingDurationInDays: 'GTC' },
          itemLocation: { country: 'DE', postalCode: draft.postalCode, location: draft.location },
          paymentTerms: { businessPolicyId: draft.paymentPolicyId },
          returnTerms: { businessPolicyId: draft.returnPolicyId },
          fulfillmentTerms: {
            shippingTerms: { businessPolicy: { businessPolicyId: draft.fulfillmentPolicyId } },
          },
        },
      },
    },
    fetcher,
    execute,
  );
  const result = readRecord(data.createListing);
  const warnings = (Array.isArray(result.warnings) ? result.warnings : [])
    .map((warning) => readRecord(warning).warningMessage)
    .filter((value): value is string => typeof value === 'string');
  if (result.__typename === 'CreateListingValidationError')
    return {
      valid: false,
      listingId: null,
      fees: [],
      warnings,
      issues: (Array.isArray(result.violations) ? result.violations : [])
        .map((violation) => readRecord(violation).violationDescription)
        .filter((value): value is string => typeof value === 'string'),
    };
  if (result.__typename !== (execute ? 'CreateListingSuccess' : 'CreateListingValidationSuccess'))
    throw new EbayError(execute ? 'save_unconfirmed' : 'invalid_response');
  const listingId = readRecord(result.listing).listingId;
  if (execute && (typeof listingId !== 'string' || !/^\d{1,20}$/.test(listingId)))
    throw new EbayError('save_unconfirmed');
  return {
    valid: true,
    listingId: execute ? String(listingId) : null,
    warnings,
    issues: [],
    fees: (Array.isArray(result.listingFees) ? result.listingFees : []).map((value) => {
      const fee = readRecord(value),
        amount = readRecord(fee.feeAmount);
      const number = readNonNegativeNumber(amount.value);
      if (
        typeof fee.listingFeeType !== 'string' ||
        number === null ||
        typeof amount.currency !== 'string'
      )
        throw new EbayError(execute ? 'save_unconfirmed' : 'invalid_response');
      return { name: fee.listingFeeType, amount: number, currency: amount.currency };
    }),
  };
}
export const EBAY_CREATED_LISTING_QUERY = `query FlipbaseCreatedListing($input: SellerActiveListingSearchInput!) {
  sellerListingSearch { activeListings(searchInput: $input) { __typename
    ... on SellerListings { listings { listingId } pagination { totalElements } }
  } }
}`;
export async function findCreatedEbayListing(
  config: EbayConfig,
  token: string,
  key: string,
  fetcher = fetch,
) {
  if (!/^[a-f0-9]{32}$/.test(key)) throw new EbayError('invalid_request');
  const data = await ebayListingGraphql(
    config,
    token,
    EBAY_CREATED_LISTING_QUERY,
    { input: { filters: { skus: [`flipbase-${key}`] }, pagination: { maxPageSize: 2 } } },
    fetcher,
  );
  const output = readRecord(readRecord(data.sellerListingSearch).activeListings);
  if (
    output.__typename !== 'SellerListings' ||
    !Array.isArray(output.listings) ||
    readRecord(output.pagination).totalElements !== output.listings.length ||
    output.listings.length > 1
  )
    throw new EbayError('invalid_response');
  const id = readRecord(output.listings[0]).listingId;
  if (id !== undefined && (typeof id !== 'string' || !/^\d{1,20}$/.test(id)))
    throw new EbayError('invalid_response');
  return { listingId: typeof id === 'string' ? id : null };
}
