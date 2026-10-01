import { EbayError, readOrder, readRecord } from '../_shared/ebay-api.ts';
import type { EbayConfig } from '../_shared/ebay-api.ts';
import type { AccountScope } from '../_shared/marketplace-contracts.ts';
import type {
  EbayOrderAssignment,
  EbayOrderBooking,
  EbayOrderBookRequest,
  EbayOrderCosts,
  EbayOrderReview,
  EbayOrderSource,
} from '../_shared/ebay-order-import-contracts.ts';
import { ebayOrderReviewHash, ebayOrderSourceKey } from '../_shared/ebay-order-source.ts';
import { isEbayCents } from '../_shared/ebay-order-amounts.ts';
import type { EbayAccountStore, StoredEbayConnection } from './handler.ts';
import { EbayConnectionError, withEbayConnection } from './connection-read.ts';

export interface StoredEbayOrderSnapshot {
  id: string;
  workspace_id: string;
  connection_id: string;
  user_id: string;
  authorization_version: number;
  environment: string;
  external_account_id: string;
  source_key: string;
  review_hash: string;
  source: EbayOrderSource;
  expires_at: string;
  booking_ready: boolean;
}
export interface EbayOrderImportStore extends EbayAccountStore {
  importAvailable(): Promise<boolean>;
  snapshot(
    userId: string,
    scope: AccountScope,
    snapshotId: string,
  ): Promise<StoredEbayOrderSnapshot | null>;
  getBooking(userId: string, connectionId: string, sourceKey: string): Promise<EbayOrderBooking>;
  storeSnapshot(
    connection: StoredEbayConnection,
    operationId: string,
    sourceKey: string,
    reviewHash: string,
    source: EbayOrderSource,
    bookingReady: boolean,
  ): Promise<EbayOrderReview>;
  book(
    bearer: string,
    input: EbayOrderBookRequest,
  ): Promise<Exclude<EbayOrderBooking, { status: 'unrecorded' }>>;
  markRecordedElsewhere(
    userId: string,
    connectionId: string,
    snapshotId: string,
    reason: string,
    saleId: string | null,
  ): Promise<Exclude<EbayOrderBooking, { status: 'unrecorded' }>>;
  clearRecordedElsewhere(userId: string, connectionId: string, sourceKey: string): Promise<boolean>;
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 256 &&
  value.trim() === value &&
  Array.from(value).every(
    (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
  );
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function assignments(value: unknown): value is readonly EbayOrderAssignment[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) return false;
  const ids = new Set<string>();
  return value.every((item) => {
    const row = readRecord(item);
    const target = readRecord(row.target);
    if (
      !identifier(row.lineItemId) ||
      ids.has(row.lineItemId) ||
      Object.keys(row).length !== 2 ||
      Object.keys(target).length !== 1 ||
      !(uuid(target.inventoryItemId) || uuid(target.catalogProductId))
    )
      return false;
    ids.add(row.lineItemId);
    return true;
  });
}
function costs(value: unknown): value is EbayOrderCosts {
  const row = readRecord(value);
  if (
    Object.keys(row).length !== 4 ||
    !isEbayCents(row.platformFeeCents) ||
    !isEbayCents(row.shippingCostCents) ||
    !(
      row.shippingMode === null ||
      ['seller_arranged', 'platform_prepaid', 'pickup'].includes(String(row.shippingMode))
    ) ||
    !Array.isArray(row.additionalCosts) ||
    row.additionalCosts.length > 50
  )
    return false;
  return row.additionalCosts.every((item) => {
    const extra = readRecord(item);
    return (
      Object.keys(extra).length === 3 &&
      ['packaging', 'payment_fee', 'promotion', 'other'].includes(String(extra.category)) &&
      isEbayCents(extra.amountCents) &&
      (extra.description === null ||
        (typeof extra.description === 'string' && extra.description.length <= 500))
    );
  });
}
export function createEbayOrderImportHandler(
  store: EbayOrderImportStore,
  config: EbayConfig,
  fetcher = fetch,
) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      ...(origin && config.allowedOrigins.includes(origin)
        ? { 'Access-Control-Allow-Origin': origin }
        : {}),
    };
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    if (origin && !config.allowedOrigins.includes(origin))
      return respond({ error: 'forbidden' }, 403);
    if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
    try {
      const bearer = request.headers.get('authorization') ?? '';
      const userId = bearer.startsWith('Bearer ') ? await store.authenticate(bearer) : null;
      if (!userId) return respond({ error: 'unauthorized' }, 401);
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 65536)
        return respond({ error: 'invalid_request' }, 400);
      let body: Record<string, unknown>;
      try {
        body = readRecord(JSON.parse(raw));
      } catch {
        return respond({ error: 'invalid_request' }, 400);
      }
      if (
        !uuid(body.workspaceId) ||
        !uuid(body.connectionId) ||
        !identifier(body.orderId) ||
        ![
          'order_review',
          'order_book',
          'order_status',
          'order_recorded_elsewhere',
          'order_clear_recorded_elsewhere',
        ].includes(String(body.action))
      )
        return respond({ error: 'invalid_request' }, 400);
      const scope: AccountScope = {
        workspaceId: body.workspaceId,
        connectionId: body.connectionId,
      };
      if (!(await store.canConnect(bearer, scope.workspaceId)))
        return respond({ error: 'forbidden' }, 403);
      const connection = await store.status(userId, scope.workspaceId, config.environment);
      if (
        !connection ||
        connection.id !== scope.connectionId ||
        connection.user_id !== userId ||
        connection.workspace_id !== scope.workspaceId ||
        connection.environment !== config.environment ||
        connection.status !== 'connected' ||
        !connection.external_account_id
      )
        return respond({ error: 'connection_changed' }, 409);
      if (!(await store.importAvailable())) return respond({ error: 'import_unavailable' }, 503);
      const sourceKey = await ebayOrderSourceKey(
        config.encryptionKey,
        scope.workspaceId,
        config.environment,
        connection.external_account_id,
        body.orderId,
      );
      if (body.action === 'order_status')
        return respond(await store.getBooking(userId, scope.connectionId, sourceKey));
      if (body.action === 'order_clear_recorded_elsewhere') {
        if (body.confirmed !== true) return respond({ error: 'invalid_request' }, 400);
        return respond({
          cleared: await store.clearRecordedElsewhere(userId, scope.connectionId, sourceKey),
        });
      }
      const stage = (ready: boolean, expectedHash?: string) =>
        withEbayConnection(
          scope,
          bearer,
          store,
          config,
          async (context) => {
            // Ein zwischen Status und Tokenzugriff gewechseltes Konto darf keine Quelle übernehmen.
            if (
              context.connection.authorization_version !== connection.authorization_version ||
              context.connection.external_account_id !== connection.external_account_id
            )
              throw new EbayConnectionError('connection_changed');
            const source = await readOrder(
              config,
              context.accessToken,
              body.orderId as string,
              fetcher,
            );
            const reviewHash = await ebayOrderReviewHash(source);
            const bookingReady = ready && reviewHash === expectedHash;
            const review = await store.storeSnapshot(
              context.connection,
              context.operationId,
              sourceKey,
              reviewHash,
              source,
              bookingReady,
            );
            return { review, bookingReady };
          },
          fetcher,
        );
      if (body.action === 'order_review') return respond((await stage(false)).review);
      if (!uuid(body.snapshotId) || !hash(body.reviewHash))
        return respond({ error: 'invalid_request' }, 400);
      if (body.action === 'order_book' && (!assignments(body.assignments) || !costs(body.costs)))
        return respond({ error: 'invalid_request' }, 400);
      if (body.action === 'order_recorded_elsewhere' && body.confirmed !== true)
        return respond({ error: 'invalid_request' }, 400);
      // Der Beleg beantwortet verlorene Antworten vor Ablauf- und Bestandsprüfungen.
      const booking = await store.getBooking(userId, scope.connectionId, sourceKey);
      if (booking.status !== 'unrecorded')
        return respond(
          booking.status === 'imported' ? { ...booking, alreadyRecorded: true } : booking,
          body.action === 'order_book' && booking.status === 'recorded_elsewhere' ? 409 : 200,
        );
      const snapshot = await store.snapshot(userId, scope, body.snapshotId);
      if (
        !snapshot ||
        snapshot.workspace_id !== scope.workspaceId ||
        snapshot.connection_id !== scope.connectionId ||
        snapshot.user_id !== userId ||
        snapshot.environment !== config.environment ||
        snapshot.external_account_id !== connection.external_account_id ||
        snapshot.authorization_version !== connection.authorization_version ||
        snapshot.source_key !== sourceKey ||
        snapshot.source.orderId !== body.orderId ||
        snapshot.review_hash !== body.reviewHash ||
        !Number.isFinite(Date.parse(snapshot.expires_at)) ||
        Date.parse(snapshot.expires_at) <= Date.now()
      )
        return respond({ error: 'review_expired_or_changed' }, 409);
      if (body.action === 'order_recorded_elsewhere') {
        if (
          body.confirmed !== true ||
          typeof body.reason !== 'string' ||
          !body.reason.trim() ||
          body.reason.length > 500 ||
          !(body.saleId === undefined || body.saleId === null || uuid(body.saleId))
        )
          return respond({ error: 'invalid_request' }, 400);
        return respond(
          await store.markRecordedElsewhere(
            userId,
            scope.connectionId,
            body.snapshotId,
            body.reason.trim(),
            typeof body.saleId === 'string' ? body.saleId : null,
          ),
        );
      }
      const staged = await stage(true, body.reviewHash);
      if (!staged.bookingReady)
        return respond({ status: 'review_changed', review: staged.review }, 409);
      // finish_read muss erfolgreich sein, bevor eine unumkehrbare Buchung beginnen kann.
      const result = await store.book(bearer, {
        ...scope,
        orderId: body.orderId,
        snapshotId: staged.review.snapshotId,
        reviewHash: staged.review.reviewHash,
        assignments: body.assignments as readonly EbayOrderAssignment[],
        costs: body.costs as unknown as EbayOrderCosts,
      });
      return respond(result, result.status === 'recorded_elsewhere' ? 409 : 200);
    } catch (error) {
      if (error instanceof EbayConnectionError)
        return respond(
          { error: error.code },
          error.code === 'unauthorized' ? 401 : error.code === 'forbidden' ? 403 : 409,
        );
      if (error instanceof EbayError)
        return respond({ error: error.code }, error.code === 'needs_login' ? 409 : 502);
      return respond({ error: 'request_failed' }, 503);
    }
  };
}
