import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const writeMetadataScript = fileURLToPath(
  new URL('./write-deployment-metadata.mjs', import.meta.url),
);
const verifyDeploymentScript = fileURLToPath(
  new URL('./verify-public-deployment.mjs', import.meta.url),
);
const commit = '0123456789abcdef0123456789abcdef01234567';

async function withServer(handler, callback) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test('schreibt die vollständige Build-SHA als auslieferbare Metadaten', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'flipbase-deployment-'));
  const output = join(directory, 'deployment.json');

  try {
    await execFileAsync(process.execPath, [writeMetadataScript, output], {
      env: { ...process.env, FLIPBASE_COMMIT: commit },
    });

    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), { commit });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('verweigert eine unvollständige Build-SHA', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'flipbase-deployment-'));
  const output = join(directory, 'deployment.json');

  try {
    await assert.rejects(
      execFileAsync(process.execPath, [writeMetadataScript, output], {
        env: { ...process.env, FLIPBASE_COMMIT: '0123456' },
      }),
      /vollständige 40-stellige Git-SHA/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('bestätigt öffentliche Startseite und exakt ausgelieferte Build-SHA', async () => {
  await withServer(
    (request, response) => {
      if (request.url === '/') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<!doctype html><title>Flipbase</title>');
        return;
      }

      if (request.url === '/deployment.json') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ commit }));
        return;
      }

      response.writeHead(404).end();
    },
    async (baseUrl) => {
      const { stdout } = await execFileAsync(process.execPath, [
        verifyDeploymentScript,
        '--base-url',
        baseUrl,
        '--expected-commit',
        commit,
        '--attempts',
        '1',
      ]);

      assert.match(stdout, new RegExp(`Commit ${commit} ist öffentlich ausgeliefert`));
    },
  );
});

test('stoppt bei einer anderen öffentlich ausgelieferten SHA', async () => {
  const oldCommit = 'fedcba9876543210fedcba9876543210fedcba98';

  await withServer(
    (request, response) => {
      response.writeHead(200, {
        'content-type': request.url === '/' ? 'text/html' : 'application/json',
      });
      response.end(request.url === '/' ? '<!doctype html>' : JSON.stringify({ commit: oldCommit }));
    },
    async (baseUrl) => {
      await assert.rejects(
        execFileAsync(process.execPath, [
          verifyDeploymentScript,
          '--base-url',
          baseUrl,
          '--expected-commit',
          commit,
          '--attempts',
          '1',
        ]),
        new RegExp(`Erwartet ${commit}, ausgeliefert ${oldCommit}`),
      );
    },
  );
});

test('stoppt, wenn die öffentliche Startseite nicht mit HTTP 200 antwortet', async () => {
  await withServer(
    (request, response) => {
      if (request.url === '/') {
        response.writeHead(503).end('maintenance');
        return;
      }

      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ commit }));
    },
    async (baseUrl) => {
      await assert.rejects(
        execFileAsync(process.execPath, [
          verifyDeploymentScript,
          '--base-url',
          baseUrl,
          '--expected-commit',
          commit,
          '--attempts',
          '1',
        ]),
        /Startseite antwortet mit HTTP 503 statt 200/,
      );
    },
  );
});
