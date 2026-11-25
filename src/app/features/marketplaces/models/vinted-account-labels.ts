import type { MarketplaceConnection } from './marketplace.models';

type NamedAccount = Pick<MarketplaceConnection, 'connectionId' | 'displayName'>;

export function vintedAccountLabels(
  accounts: readonly NamedAccount[],
): ReadonlyMap<string, string> {
  const accountsByName = new Map<string, NamedAccount[]>();
  const nameKey = (account: NamedAccount) =>
    account.displayName.trim().normalize('NFKC').toLocaleLowerCase('de-DE');
  for (const account of accounts) {
    const key = nameKey(account);
    const matchingAccounts = accountsByName.get(key);
    if (matchingAccounts) matchingAccounts.push(account);
    else accountsByName.set(key, [account]);
  }

  return new Map(
    accounts.map((account) => {
      const matchingAccounts = accountsByName.get(nameKey(account)) ?? [];
      if (matchingAccounts.length < 2) return [account.connectionId, account.displayName];

      let suffixLength = 6;
      while (
        suffixLength < account.connectionId.length &&
        matchingAccounts.some(
          (other) =>
            other.connectionId !== account.connectionId &&
            other.connectionId.endsWith(account.connectionId.slice(-suffixLength)),
        )
      )
        suffixLength++;
      return [
        account.connectionId,
        `${account.displayName} · ${account.connectionId.slice(-suffixLength)}`,
      ];
    }),
  );
}
