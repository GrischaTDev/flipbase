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
const verifyLandingScript = fileURLToPath(
  new URL('./verify-landing-deployment.mjs', import.meta.url),
);
const workflowPath = fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url));
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

      if (request.url === '/healthz') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('ok');
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
      if (request.url === '/') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<!doctype html>');
        return;
      }
      if (request.url === '/healthz') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('ok');
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ commit: oldCommit }));
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

test('stoppt, wenn der öffentliche Healthcheck nicht exakt ok liefert', async () => {
  await withServer(
    (request, response) => {
      if (request.url === '/') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<!doctype html>');
        return;
      }
      if (request.url === '/healthz') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('starting');
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
        /Healthcheck liefert "starting" statt "ok"/,
      );
    },
  );
});

test('bestätigt Landingpage, lokale Formularlogik und passende CSP', async () => {
  await withServer(
    (request, response) => {
      if (request.url === '/') {
        response.writeHead(200, {
          'content-type': 'text/html',
          'content-security-policy': "default-src 'self'; script-src 'self'; object-src 'none'",
        });
        response.end('<!doctype html><script src="landing.js" defer></script>');
        return;
      }
      if (request.url === '/landing.js') {
        response.writeHead(200, { 'content-type': 'text/javascript' });
        response.end("var ENDPOINT = 'https://api.flipbase.de/functions/v1/beta-application';");
        return;
      }
      response.writeHead(404).end();
    },
    async (baseUrl) => {
      const { stdout } = await execFileAsync(process.execPath, [
        verifyLandingScript,
        '--base-url',
        baseUrl,
        '--attempts',
        '1',
      ]);

      assert.match(stdout, /Landingpage und Formularskript sind öffentlich nutzbar/u);
    },
  );
});

test('stoppt bei einer veralteten CSP ohne Freigabe für das lokale Formularskript', async () => {
  await withServer(
    (request, response) => {
      response.writeHead(200, {
        'content-type': 'text/html',
        'content-security-policy': "default-src 'self'; script-src 'sha256-veraltet='",
      });
      response.end('<!doctype html><script src="landing.js" defer></script>');
    },
    async (baseUrl) => {
      await assert.rejects(
        execFileAsync(process.execPath, [
          verifyLandingScript,
          '--base-url',
          baseUrl,
          '--attempts',
          '1',
        ]),
        /script-src muss lokale Skripte mit 'self' erlauben/u,
      );
    },
  );
});

test('prüft die Landingpage nach jedem Produktionsdeployment', async () => {
  const workflow = await readFile(workflowPath, 'utf8');
  assert.match(
    workflow,
    /node scripts\/verify-landing-deployment\.mjs --base-url https:\/\/flipbase\.de/u,
  );
});
