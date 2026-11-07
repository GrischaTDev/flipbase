import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { SniperQuery } from '../domain/query.js';
import type {
  VintedComparisonCatalogItem,
  VintedComparisonCatalogPage,
} from '../vinted/comparison-catalog-page.js';
import type { VintedComparisonItem } from '../vinted/comparison-item-page.js';

const PositiveId = z.number().int().positive().max(2147483647);
const QuerySchema = z.object({
  id: z.string().min(1).max(128),
  queryKey: z.string().max(4096),
  marketplace: z.literal('vinted'),
  searchText: z.string().max(500).nullable(),
  catalogId: PositiveId.nullable(),
  brandId: PositiveId.nullable(),
  // Der Vergleichsabruf darf niemals die Einkaufsgrenzen des Feeds übernehmen.
  priceTo: z.unknown().transform(() => null),
  priceFrom: z.unknown().transform(() => null),
  pollIntervalMs: z.number().int().positive(),
  isSeeded: z.boolean(),
  isActive: z.boolean(),
  runState: z.enum(['ready', 'cooldown', 'blocked', 'invalid']),
  nextAttemptAt: z.string().nullable(),
  lastAttemptAt: z.string().nullable(),
  lastSuccessAt: z.string().nullable(),
  lastErrorKind: z.string().nullable(),
  lastErrorAt: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  lastPolledAt: z.string().nullable(),
  lastStatus: z.enum(['never_polled', 'ok', 'rate_limited', 'forbidden', 'failed']),
  consecutiveFailures: z.number().int().nonnegative(),
  brandIds: z.array(PositiveId).max(10).optional(),
  titleKeywords: z.array(z.string().max(200)).max(30).optional(),
  excludedTitleKeywords: z.array(z.string().max(200)).max(30).optional(),
  keywordMode: z.enum(['all', 'any']).optional(),
  filterRevision: z.number().int().positive().optional(),
  filterFormatVersion: z.literal(1).optional(),
  requestCursor: z.number().int().nonnegative().max(2147483646).optional(),
  seededRequests: z.array(z.number().int().nonnegative()).optional(),
});

const TaskSchema = z.object({
  id: z.string().regex(/^(catalog|detail):[1-9]\d*$/),
  lease_token: z.string().uuid(),
  kind: z.enum(['catalog', 'detail']),
  query_id: z.string().min(1).max(128).optional(),
  query_revision: z.number().int().positive().optional(),
  request_cursor: z.number().int().nonnegative().max(2147483646).optional(),
  page: z.number().int().min(1).max(10).optional(),
  window_start: z.iso.datetime({ offset: true }).optional(),
  external_id: z
    .string()
    .regex(/^[1-9]\d{0,19}$/)
    .optional(),
  url: z.string().min(1).max(4096).optional(),
  consecutive_failures: z.number().int().nonnegative().default(0),
  query: QuerySchema.optional(),
});

interface ComparisonTaskLease {
  id: string;
  leaseToken: string;
  consecutiveFailures: number;
}

export interface CatalogComparisonTask extends ComparisonTaskLease {
  kind: 'catalog';
  query: SniperQuery;
  page: number;
  windowStart: string;
}

export interface DetailComparisonTask extends ComparisonTaskLease {
  kind: 'detail';
  externalId: string;
  url: string;
}

export type ComparisonTask = CatalogComparisonTask | DetailComparisonTask;

export type ComparisonTaskResult =
  | {
      kind: 'catalog';
      observed_at: string;
      page: number;
      sourceItemCount: number;
      requestIndex: number;
      requestCount: number;
      items: VintedComparisonCatalogItem[];
      pagination: VintedComparisonCatalogPage['pagination'];
    }
  | { kind: 'detail'; observed_at: string; item: VintedComparisonItem };

export interface ComparisonStoreLike {
  claim(now: Date): Promise<ComparisonTask | null>;
  complete(task: ComparisonTask, result: ComparisonTaskResult): Promise<boolean>;
  fail(
    task: ComparisonTask,
    retryAt: Date,
    errorKind: string,
    errorMessage: string,
  ): Promise<boolean>;
}

export function parseComparisonTask(value: unknown): ComparisonTask | null {
  if (value === null) return null;
  const task = TaskSchema.parse(value);
  if (!task.id.startsWith(`${task.kind}:`)) throw new Error('Invalid comparison task kind');
  const lease = {
    id: task.id,
    leaseToken: task.lease_token,
    consecutiveFailures: task.consecutive_failures,
  };
  if (task.kind === 'detail') {
    if (!task.external_id || !task.url) throw new Error('Incomplete comparison item task');
    return { ...lease, kind: 'detail', externalId: task.external_id, url: task.url };
  }
  if (!task.query || !task.page || !task.window_start)
    throw new Error('Incomplete comparison catalog task');
  if (
    task.query.isActive !== true ||
    task.query.runState === 'invalid' ||
    task.query.filterFormatVersion !== 1 ||
    task.query.id !== task.query_id ||
    task.query.filterRevision !== task.query_revision ||
    task.request_cursor === undefined
  )
    throw new Error('Invalid comparison query revision');
  return {
    ...lease,
    kind: 'catalog',
    page: task.page,
    windowStart: task.window_start,
    query: { ...task.query, requestCursor: task.request_cursor },
  };
}

/** Reservierung und Fortschritt werden atomar samt Lease-Token in Postgres geprüft. */
export class ComparisonStore implements ComparisonStoreLike {
  constructor(private readonly client: SupabaseClient) {}

  async claim(now: Date): Promise<ComparisonTask | null> {
    const { data, error } = await this.client.rpc('claim_vinted_comparison_task', {
      p_now: now.toISOString(),
    });
    if (error) throw new Error(`claiming comparison task failed: ${error.message}`);
    return parseComparisonTask(data);
  }

  async complete(task: ComparisonTask, result: ComparisonTaskResult): Promise<boolean> {
    if (task.kind !== result.kind) throw new Error('Mismatched comparison task result');
    const { data, error } = await this.client.rpc('complete_vinted_comparison_task', {
      p_task_id: task.id,
      p_lease_token: task.leaseToken,
      p_result: result,
    });
    if (error) throw new Error(`saving comparison task failed: ${error.message}`);
    if (typeof data !== 'boolean') throw new Error('Invalid comparison completion response');
    return data;
  }

  async fail(
    task: ComparisonTask,
    retryAt: Date,
    errorKind: string,
    errorMessage: string,
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc('fail_vinted_comparison_task', {
      p_task_id: task.id,
      p_lease_token: task.leaseToken,
      p_retry_at: retryAt.toISOString(),
      p_error_kind: errorKind.slice(0, 80),
      p_error_message: errorMessage.slice(0, 500),
    });
    if (error) throw new Error(`retrying comparison task failed: ${error.message}`);
    if (typeof data !== 'boolean') throw new Error('Invalid comparison retry response');
    return data;
  }
}
