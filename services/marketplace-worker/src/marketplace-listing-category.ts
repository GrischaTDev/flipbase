import { parseVintedSellingTree } from '../../../supabase/functions/_shared/vinted-selling-tree.mjs';
interface ListingCategoryOptions {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly request: typeof fetch;
}
interface ListingCategoryAccount {
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly accountId: string;
}

/** Liest ausschließlich den atomaren Verkaufsbaum des für diesen Auftrag bestätigten Kontos. */
export async function loadMarketplaceListingCategoryPath(
  options: ListingCategoryOptions,
  targetId: number,
  authorize: () => Promise<boolean>,
  account: ListingCategoryAccount,
): Promise<readonly number[]> {
  try {
    if (
      !Number.isInteger(targetId) ||
      targetId < 1 ||
      targetId > 2147483647 ||
      !options.serviceRoleKey.trim() ||
      !/^[1-9][0-9]{0,31}$/.test(account.accountId)
    )
      throw new Error();
    for (const id of [account.workspaceId, account.connectionId])
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error();
    const url = new URL('/rest/v1/vinted_selling_category_snapshots', options.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error();
    url.searchParams.set('select', 'workspace_id,connection_id,external_account_id,categories');
    for (const [key, value] of Object.entries({
      workspace_id: account.workspaceId,
      connection_id: account.connectionId,
      external_account_id: account.accountId,
    }))
      url.searchParams.set(key, 'eq.' + value);
    url.searchParams.set('limit', '2');
    if (!(await authorize())) throw new Error();
    const response = await options.request(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        apikey: options.serviceRoleKey,
        Authorization: 'Bearer ' + options.serviceRoleKey,
        'Accept-Profile': 'public',
      },
    });
    if (response.status !== 200 || response.redirected) throw new Error();
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error();
    const row: unknown = rows[0];
    if (
      !row ||
      typeof row !== 'object' ||
      !('workspace_id' in row) ||
      row.workspace_id !== account.workspaceId ||
      !('connection_id' in row) ||
      row.connection_id !== account.connectionId ||
      !('external_account_id' in row) ||
      row.external_account_id !== account.accountId ||
      !('categories' in row)
    )
      throw new Error();
    const categories = parseVintedSellingTree(row.categories);
    let current = categories.find((category) => category.id === targetId);
    if (!current?.isLeaf) throw new Error();
    const ancestors: number[] = [];
    while (current.parentId !== null) {
      ancestors.unshift(current.parentId);
      current = categories.find((category) => category.id === current?.parentId);
      if (!current) throw new Error();
    }
    if (!(await authorize())) throw new Error();
    return Object.freeze(ancestors);
  } catch {
    throw new Error(
      'Der kontobezogene Vinted-Kategoriepfad konnte nicht geladen werden. Aktualisiere das Konto.',
    );
  }
}
