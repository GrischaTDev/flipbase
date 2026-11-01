import { ebayJson, EbayError, getEbayHosts, readRecord } from './ebay-api.ts';
import type { EbayConfig } from './ebay-api.ts';
import type {
  EbayCategoryDetails,
  EbayListingSettings,
} from './ebay-listing-creation-contracts.ts';

export async function readEbayListingSettings(
  config: EbayConfig,
  token: string,
  fetcher = fetch,
): Promise<EbayListingSettings> {
  const entries = await Promise.all(
    (['payment', 'fulfillment', 'return'] as const).map(async (kind) => {
      const body = await ebayJson(
        `${getEbayHosts(config.environment).api}/sell/account/v1/${kind}_policy?marketplace_id=EBAY_DE`,
        token,
        fetcher,
      );
      const rows = body[`${kind}Policies`];
      if (!Array.isArray(rows)) throw new EbayError('invalid_response');
      return rows.map((value) => {
        const row = readRecord(value),
          id = row[`${kind}PolicyId`];
        if (typeof id !== 'string' || typeof row.name !== 'string')
          throw new EbayError('invalid_response');
        return { id, name: row.name };
      });
    }),
  );
  return { payment: entries[0], fulfillment: entries[1], returns: entries[2] };
}
async function categoryTree(
  config: EbayConfig,
  token: string,
  fetcher: typeof fetch,
): Promise<string> {
  const result = await ebayJson(
    `${getEbayHosts(config.environment).api}/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_DE`,
    token,
    fetcher,
  );
  if (typeof result.categoryTreeId !== 'string' || !/^\d+$/.test(result.categoryTreeId))
    throw new EbayError('invalid_response');
  return result.categoryTreeId;
}
export async function searchEbayCategories(
  config: EbayConfig,
  token: string,
  query: unknown,
  fetcher = fetch,
) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 100)
    throw new EbayError('invalid_request');
  const tree = await categoryTree(config, token, fetcher);
  const body = await ebayJson(
    `${getEbayHosts(config.environment).api}/commerce/taxonomy/v1/category_tree/${tree}/get_category_suggestions?q=${encodeURIComponent(query)}`,
    token,
    fetcher,
  );
  if (!Array.isArray(body.categorySuggestions)) throw new EbayError('invalid_response');
  return {
    categories: body.categorySuggestions.slice(0, 30).map((value) => {
      const suggestion = readRecord(value),
        category = readRecord(suggestion.category);
      if (typeof category.categoryId !== 'string' || typeof category.categoryName !== 'string')
        throw new EbayError('invalid_response');
      const ancestors = (
        Array.isArray(suggestion.categoryTreeNodeAncestors)
          ? suggestion.categoryTreeNodeAncestors
          : []
      )
        .map(readRecord)
        .sort((a, b) => Number(a.categoryTreeNodeLevel) - Number(b.categoryTreeNodeLevel))
        .map((ancestor) => String(ancestor.categoryName));
      return { id: category.categoryId, name: [...ancestors, category.categoryName].join(' › ') };
    }),
  };
}
export async function readEbayCategoryDetails(
  config: EbayConfig,
  token: string,
  categoryId: unknown,
  fetcher = fetch,
): Promise<EbayCategoryDetails> {
  if (typeof categoryId !== 'string' || !/^\d{1,20}$/.test(categoryId))
    throw new EbayError('invalid_request');
  const tree = await categoryTree(config, token, fetcher);
  const [aspects, conditions] = await Promise.all([
    ebayJson(
      `${getEbayHosts(config.environment).api}/commerce/taxonomy/v1/category_tree/${tree}/get_item_aspects_for_category?category_id=${categoryId}`,
      token,
      fetcher,
    ),
    ebayJson(
      `${getEbayHosts(config.environment).api}/sell/metadata/v1/marketplace/EBAY_DE/get_item_condition_policies?filter=${encodeURIComponent(`categoryIds:{${categoryId}}`)}`,
      token,
      fetcher,
    ),
  ]);
  const policy = (
    Array.isArray(conditions.itemConditionPolicies) ? conditions.itemConditionPolicies : []
  )
    .map(readRecord)
    .find((policy) => policy.categoryId === categoryId);
  if (!Array.isArray(aspects.aspects) || !Array.isArray(policy?.itemConditions))
    throw new EbayError('invalid_response');
  return {
    conditions: policy.itemConditions.map((value) => {
      const condition = readRecord(value);
      return { id: String(condition.conditionId), name: String(condition.conditionDescription) };
    }),
    aspects: aspects.aspects.map((value) => {
      const aspect = readRecord(value),
        constraint = readRecord(aspect.aspectConstraint);
      if (typeof aspect.localizedAspectName !== 'string') throw new EbayError('invalid_response');
      return {
        name: aspect.localizedAspectName,
        required: constraint.aspectRequired === true,
        selectionOnly: constraint.aspectMode === 'SELECTION_ONLY',
        multiple: constraint.itemToAspectCardinality === 'MULTI',
        values: (Array.isArray(aspect.aspectValues) ? aspect.aspectValues : []).map((value) =>
          String(readRecord(value).localizedValue),
        ),
      };
    }),
  };
}
