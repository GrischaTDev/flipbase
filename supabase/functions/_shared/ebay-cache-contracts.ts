import type { EbayEnvironment, EbayListing, EbayOrder, EbayPage } from './ebay-contracts.ts';
import type { EbayOrderSource } from './ebay-order-import-contracts.ts';
import type { AccountScope } from './marketplace-contracts.ts';

export type EbayCacheKind = 'orders' | 'listings';
export interface EbayCacheSync {
  readonly status: 'pending' | 'syncing' | 'ready' | 'error';
  readonly lastCompletedAt: string | null;
  readonly lastError: 'unavailable' | null;
}
export interface EbayCacheReadArgs {
  readonly p_workspace_id: string;
  readonly p_connection_id: string;
  readonly p_environment: EbayEnvironment;
  readonly p_kind: EbayCacheKind;
  readonly p_page: number;
}
export type EbayCacheRefreshArgs = Omit<EbayCacheReadArgs, 'p_page'>;
export interface EbayCachedOrderWrite {
  readonly sourceKey: string;
  readonly source: EbayOrderSource;
}
export interface EbayCacheScan {
  readonly id: number;
  readonly kind: EbayCacheKind;
  readonly from: string;
  readonly to: string;
  readonly offset: number;
  readonly initial: boolean;
}
export interface EbayCacheConnection {
  readonly id: string;
  readonly workspace_id: string;
  readonly user_id: string;
  readonly environment: EbayEnvironment;
  readonly external_account_id: string;
  readonly authorization_version: number;
  readonly operation_id: string;
}
export interface EbayCacheClaim {
  readonly connection: {
    readonly connection: EbayCacheConnection;
    readonly encryptedTokens: string;
  };
  readonly scan: EbayCacheScan;
}
export interface EbayCacheClaimArgs {
  readonly p_environment: EbayEnvironment;
}
export interface EbayCacheLeaseArgs {
  readonly p_connection_id: string;
  readonly p_operation_id: string;
  readonly p_version: number;
  readonly p_scan_id: number;
}
export interface EbayCachePageArgs extends EbayCacheLeaseArgs {
  readonly p_offset: number;
  readonly p_rows: readonly (EbayCachedOrderWrite | EbayListing)[];
  readonly p_complete: boolean;
  readonly p_total: number;
}
export interface EbayCacheDelayArgs extends EbayCacheLeaseArgs {
  readonly p_delay_seconds: number;
}
export interface EbayCacheFinishArgs extends EbayCacheLeaseArgs {
  readonly p_encrypted_tokens?: string | null;
  readonly p_needs_login?: boolean;
  readonly p_observed?: boolean;
}
export type EbayCacheRead = (
  bearer: string,
  scope: AccountScope,
  kind: EbayCacheKind,
  page: number,
) => Promise<Pick<EbayPage<EbayOrder | EbayListing>, 'items' | 'total' | 'nextPage' | 'sync'>>;

export interface EbayCacheRpcContract {
  readonly ebay_cache_read: {
    readonly args: EbayCacheReadArgs;
    readonly result: EbayPage<EbayOrder | EbayListing>;
  };
  readonly ebay_cache_refresh: { readonly args: EbayCacheRefreshArgs; readonly result: void };
  readonly ebay_cache_claim: {
    readonly args: EbayCacheClaimArgs;
    readonly result: EbayCacheClaim | null;
  };
  readonly ebay_cache_page: { readonly args: EbayCachePageArgs; readonly result: boolean };
  readonly ebay_cache_delay: { readonly args: EbayCacheDelayArgs; readonly result: void };
  readonly ebay_cache_finish: { readonly args: EbayCacheFinishArgs; readonly result: boolean };
}

// RPCs: ebay_cache_claim({p_environment}) → ObserverClaim|null;
// ebay_cache_page(EbayCachePageArgs) → boolean; ebay_cache_delay(EbayCacheDelayArgs) → void.
// ebay_cache_finish(EbayCacheFinishArgs) → boolean, gibt die Kontolease und Scanlease gemeinsam frei.
// ebay_cache_read(EbayCacheReadArgs) → EbayPage<EbayOrder|EbayListing>.
// Task 2 liest workerseitig ebay_cached_orders.source/source_key/auto_prepare.
// auto_prepare ist ein dauerhaftes Ereignismerkmal, keine Buchung oder Reservierung.
