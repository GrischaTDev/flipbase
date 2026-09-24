import {
  createArticleMediaCleanupHandler,
  isCanonicalArticlePath,
  type CleanupDependencies,
  type CleanupJob,
} from './index.ts';

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`);
}

const job: CleanupJob = {
  id: 1,
  workspace_id: 'a2400000-0000-4000-8000-000000000010',
  article_kind: 'catalog',
  article_id: 'a2400000-0000-4000-8000-000000000025',
  bucket_id: 'item-media',
  storage_path:
    'catalog-products/a2400000-0000-4000-8000-000000000010/a2400000-0000-4000-8000-000000000025/a2400000-0000-4000-8000-000000000026.webp',
  attempt_count: 0,
  next_attempt_at: '2026-09-24T00:00:00Z',
};

function request(workspaceId = job.workspace_id): Request {
  return new Request('https://api.flipbase.de/functions/v1/article-media-cleanup', {
    method: 'POST',
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId }),
  });
}

function setup(overrides: Partial<CleanupDependencies> = {}) {
  const removed: string[] = [];
  const completed: number[] = [];
  const failed: number[] = [];
  const dependencies: CleanupDependencies = {
    isConfigured: () => true,
    authenticate: async () => 'member',
    isMember: async () => true,
    loadJobs: async () => [job],
    removeFile: async (path) => {
      removed.push(path);
    },
    markComplete: async (entry) => {
      completed.push(entry.id);
    },
    markFailed: async (entry) => {
      failed.push(entry.id);
    },
    countPending: async () => 0,
    background: () => {},
    ...overrides,
  };
  return { handler: createArticleMediaCleanupHandler(dependencies), removed, completed, failed };
}

Deno.test('verweigert fremde Workspaces vor jedem Storage-Zugriff', async () => {
  const { handler, removed } = setup({ isMember: async () => false });
  assertEquals((await handler(request())).status, 403);
  assertEquals(removed, []);
});

Deno.test('weist fremde und manipulierte Bildpfade zurück', async () => {
  assertEquals(isCanonicalArticlePath(job), true);
  assertEquals(
    isCanonicalArticlePath({
      ...job,
      storage_path: job.storage_path.replace(job.workspace_id, 'other'),
    }),
    false,
  );
  assertEquals(
    isCanonicalArticlePath({
      ...job,
      article_kind: 'item',
      storage_path: 'other/../../secret.webp',
    }),
    false,
  );
  const { handler, removed, failed } = setup({
    loadJobs: async () => [{ ...job, storage_path: 'other/secret.webp' }],
  });
  const response = await handler(request());
  assertEquals(response.status, 200);
  assertEquals(removed, []);
  assertEquals(failed, [1]);
});

Deno.test('erkennt auch PDF-Anhänge eines Einzelstücks im eigenen Pfad', () => {
  assertEquals(
    isCanonicalArticlePath({
      ...job,
      article_kind: 'item',
      storage_path: `${job.article_id}/1780000000000_beleg.pdf`,
    }),
    true,
  );
});

Deno.test('entfernt nur den exakten Pfad und markiert den Auftrag abgeschlossen', async () => {
  const { handler, removed, completed } = setup();
  const response = await handler(request());
  assertEquals(await response.json(), { completed: 1, pending: 0, failed: 0 });
  assertEquals(removed, [job.storage_path]);
  assertEquals(completed, [1]);
});

Deno.test('bewahrt fehlgeschlagene Aufträge für einen späteren Versuch', async () => {
  const { handler, failed } = setup({
    removeFile: async () => {
      throw new Error('Storage offline');
    },
  });
  const response = await handler(request());
  assertEquals(await response.json(), { completed: 0, pending: 0, failed: 1 });
  assertEquals(failed, [1]);
});

Deno.test('meldet fehlende Serverkonfiguration klar', async () => {
  const { handler, removed } = setup({ isConfigured: () => false });
  assertEquals((await handler(request())).status, 503);
  assertEquals(removed, []);
});
