import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

export interface CleanupJob {
  readonly id: number;
  readonly workspace_id: string;
  readonly article_kind: 'catalog' | 'item';
  readonly article_id: string;
  readonly bucket_id: string;
  readonly storage_path: string;
  readonly attempt_count: number;
  readonly next_attempt_at: string;
}

export interface CleanupDependencies {
  isConfigured(): boolean;
  authenticate(token: string): Promise<string | null>;
  isMember(userId: string, workspaceId: string, token: string): Promise<boolean>;
  loadJobs(workspaceId: string, force: boolean): Promise<readonly CleanupJob[]>;
  removeFile(path: string): Promise<void>;
  markComplete(job: CleanupJob): Promise<void>;
  markFailed(job: CleanupJob, message: string): Promise<void>;
  countPending(workspaceId: string): Promise<number>;
  background(task: () => Promise<void>): void;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const imageName =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|avif)$/i;
const legacyName = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpg|jpeg|png|webp|gif|avif|pdf)$/i;

export function isCanonicalArticlePath(job: CleanupJob): boolean {
  if (job.bucket_id !== 'item-media' || !uuid.test(job.workspace_id) || !uuid.test(job.article_id))
    return false;
  const segments = job.storage_path.split('/');
  if (job.article_kind === 'catalog')
    return (
      segments.length === 4 &&
      segments[0] === 'catalog-products' &&
      segments[1] === job.workspace_id &&
      segments[2] === job.article_id &&
      imageName.test(segments[3])
    );
  return (
    job.article_kind === 'item' &&
    segments.length === 2 &&
    segments[0] === job.article_id &&
    legacyName.test(segments[1]) &&
    !segments[1].includes('..')
  );
}

function response(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function scheduleBackgroundRetry(job: CleanupJob, dependencies: CleanupDependencies): void {
  dependencies.background(async () => {
    for (let extraAttempt = 1; extraAttempt <= 2; extraAttempt++) {
      await new Promise((resolve) => setTimeout(resolve, extraAttempt * 250));
      const updatedJob = { ...job, attempt_count: job.attempt_count + extraAttempt };
      try {
        await dependencies.removeFile(job.storage_path);
        await dependencies.markComplete(updatedJob);
        return;
      } catch (error: unknown) {
        await dependencies.markFailed(
          updatedJob,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  });
}

export function createArticleMediaCleanupHandler(dependencies: CleanupDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return response({});
    if (request.method !== 'POST') return response({ error: 'Methode nicht erlaubt.' }, 405);
    if (!dependencies.isConfigured()) return response({ error: 'Serverkonfiguration fehlt.' }, 503);
    const token = /^Bearer (.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!token) return response({ error: 'Anmeldung fehlt.' }, 401);
    let input: Record<string, unknown> | null;
    try {
      input = object(await request.json());
    } catch {
      input = null;
    }
    const workspaceId = input?.['workspaceId'];
    const force = input?.['force'] ?? false;
    if (typeof workspaceId !== 'string' || !uuid.test(workspaceId) || typeof force !== 'boolean')
      return response({ error: 'Ungültiger Workspace oder Wiederholungswert.' }, 400);
    try {
      const userId = await dependencies.authenticate(token);
      if (!userId) return response({ error: 'Anmeldung ungültig.' }, 401);
      if (!(await dependencies.isMember(userId, workspaceId, token)))
        return response({ error: 'Kein Zugriff auf diesen Workspace.' }, 403);

      let completed = 0;
      let failed = 0;
      const jobs = await dependencies.loadJobs(workspaceId, force);
      for (const job of jobs.slice(0, 25)) {
        if (job.workspace_id !== workspaceId) {
          failed++;
          continue;
        }
        if (!isCanonicalArticlePath(job)) {
          await dependencies.markFailed(job, 'Ungültiger Bildpfad im Bereinigungsauftrag.');
          failed++;
          continue;
        }
        try {
          await dependencies.removeFile(job.storage_path);
          await dependencies.markComplete(job);
          completed++;
        } catch (error: unknown) {
          await dependencies.markFailed(
            job,
            error instanceof Error ? error.message : String(error),
          );
          scheduleBackgroundRetry(job, dependencies);
          failed++;
        }
      }
      return response({ completed, pending: await dependencies.countPending(workspaceId), failed });
    } catch (error: unknown) {
      console.error('article-media-cleanup: Bereinigung fehlgeschlagen.', error);
      return response({ error: 'Bildbereinigung konnte nicht abgeschlossen werden.' }, 500);
    }
  };
}

function productionDependencies(): CleanupDependencies {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) {
    return { isConfigured: () => false } as CleanupDependencies;
  }
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const userClient = (token: string) =>
    createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
  return {
    isConfigured: () => true,
    async authenticate(token) {
      const { data, error } = await userClient(token).auth.getUser();
      return error ? null : (data.user?.id ?? null);
    },
    async isMember(userId, workspaceId, token) {
      const { data, error } = await userClient(token)
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async loadJobs(workspaceId, force) {
      let query = admin
        .from('article_media_cleanup_jobs')
        .select(
          'id, workspace_id, article_kind, article_id, bucket_id, storage_path, attempt_count, next_attempt_at',
        )
        .eq('workspace_id', workspaceId)
        .is('completed_at', null);
      if (!force) query = query.lte('next_attempt_at', new Date().toISOString());
      const { data, error } = await query.order('id').limit(25);
      if (error) throw error;
      return (data ?? []) as CleanupJob[];
    },
    async removeFile(path) {
      const { error } = await admin.storage.from('item-media').remove([path]);
      if (error) throw error;
    },
    async markComplete(job) {
      const { error } = await admin
        .from('article_media_cleanup_jobs')
        .update({ completed_at: new Date().toISOString(), last_error: null })
        .eq('id', job.id)
        .eq('workspace_id', job.workspace_id)
        .is('completed_at', null);
      if (error) throw error;
    },
    async markFailed(job, message) {
      const delayMs = Math.min(60_000 * 2 ** Math.min(job.attempt_count, 6), 3_600_000);
      const { error } = await admin
        .from('article_media_cleanup_jobs')
        .update({
          attempt_count: job.attempt_count + 1,
          next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
          last_error: message.slice(0, 500),
        })
        .eq('id', job.id)
        .eq('workspace_id', job.workspace_id)
        .is('completed_at', null);
      if (error) throw error;
    },
    async countPending(workspaceId) {
      const { count, error } = await admin
        .from('article_media_cleanup_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .is('completed_at', null);
      if (error) throw error;
      return count ?? 0;
    },
    background(task) {
      const promise = task();
      const runtime = globalThis as typeof globalThis & {
        EdgeRuntime?: { waitUntil(value: Promise<void>): void };
      };
      if (runtime.EdgeRuntime) runtime.EdgeRuntime.waitUntil(promise);
      else
        void promise.catch((error) =>
          console.error('article-media-cleanup: Hintergrundversuch fehlgeschlagen.', error),
        );
    },
  };
}

if (import.meta.main) Deno.serve(createArticleMediaCleanupHandler(productionDependencies()));
