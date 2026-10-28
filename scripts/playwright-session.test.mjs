import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ts from 'typescript';

const executeFile = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));

/** Echte Supabase-Clients und Playwright-Fixtures, ausschließlich mit lokalem HTTP-Gegenüber. */
async function sessionHarness(
  context,
  { loginFailure = false, sessionSeconds = 900, invalidExpiry = false } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'flipbase-session-contract-'));
  const logins = [];
  const workspaceTokens = new Map();
  const workerTokens = new Map();
  const waitingWorkers = [];
  const userId = randomUUID();
  let credentials;
  const reply = (response, status, data) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(data));
  };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    const accessToken = request.headers.authorization?.replace(/^Bearer /u, '');
    const user = { id: userId, email: credentials?.email, aud: 'authenticated' };
    if (url.pathname === '/auth/v1/admin/users') {
      credentials = { email: body.email, password: body.password };
      return reply(response, 200, { ...user, email: body.email });
    }
    if (url.pathname === '/rest/v1/workspace_members')
      return reply(response, 200, { workspace_id: randomUUID() });
    if (url.pathname === '/rest/v1/workspaces') return reply(response, 200, null);
    if (url.pathname === '/auth/v1/token') {
      if (
        url.searchParams.get('grant_type') !== 'password' ||
        body.email !== credentials?.email ||
        body.password !== credentials?.password
      )
        return reply(response, 400, { msg: 'Unerwartete Anmeldung oder Refresh-Anfrage.' });
      if (loginFailure && logins.length > 0)
        return reply(response, 400, { msg: 'Anmeldung absichtlich abgelehnt.' });
      const now = Math.floor(Date.now() / 1000);
      const payload = Buffer.from(
        JSON.stringify({ sub: userId, aud: 'authenticated', iat: now, exp: now + 900 }),
      ).toString('base64url');
      const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${payload}.${randomUUID()}`;
      logins.push(token);
      return reply(response, 200, {
        access_token: token,
        refresh_token: randomUUID(),
        token_type: 'bearer',
        expires_in: logins.length === 1 ? 900 : sessionSeconds,
        ...(logins.length > 1 && invalidExpiry ? { expires_at: 'invalid' } : {}),
        user,
      });
    }
    if (url.pathname === '/auth/v1/user') {
      if (!logins.includes(accessToken))
        return reply(response, 401, { msg: 'Unbekannte Sitzung.' });
      return reply(response, 200, user);
    }
    if (url.pathname === '/rest/v1/rpc/create_workspace') {
      const id = randomUUID();
      workspaceTokens.set(id, accessToken);
      return reply(response, 200, id);
    }
    if (url.pathname === '/rest/v1/suppliers') return reply(response, 201, null);
    if (url.pathname.startsWith('/fixture/workspace/'))
      return reply(response, 200, {
        accessToken: workspaceTokens.get(url.pathname.split('/').at(-1)),
      });
    if (url.pathname === '/fixture/workers') {
      workerTokens.set(body.worker, body.accessToken);
      waitingWorkers.push(response);
      if (workerTokens.size === 2)
        for (const waiting of waitingWorkers.splice(0)) reply(waiting, 200, {});
      return;
    }
    return reply(response, 404, { msg: 'Unbekannter Fixture-Endpunkt.' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  for (const path of [
    'playwright.config.ts',
    'e2e/global-setup.ts',
    'e2e/support/fixtures.ts',
    'e2e/support/test-account.ts',
    'e2e/support/local-supabase.ts',
  ]) {
    const target = join(directory, path.replace(/\.ts$/u, '.js'));
    await mkdir(dirname(target), { recursive: true });
    const source = await readFile(join(root, path), 'utf8');
    await writeFile(
      target,
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    );
  }
  await mkdir(join(directory, 'src/environments'), { recursive: true });
  await writeFile(
    join(directory, 'src/environments/environment.development.js'),
    `exports.environment = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: 'local-contract-key' })};`,
  );
  await symlink(join(root, 'node_modules'), join(directory, 'node_modules'), 'junction');
  await mkdir(join(directory, 'e2e/contracts'), { recursive: true });
  await writeFile(
    join(directory, 'contract.config.js'),
    `const base = require('./playwright.config.js').default;
module.exports = {
  ...base, testDir: './e2e/contracts', testMatch: '*.spec.js', webServer: undefined,
  globalSetup: './e2e/global-setup.js', fullyParallel: false, workers: 2,
  retries: 0, reporter: 'json', timeout: 15000,
};`,
  );
  await writeFile(
    join(directory, 'e2e/contracts/fixture.js'),
    `const { readFileSync } = require('node:fs');
const { test: base, expect } = require('../support/fixtures');
const { AUTH_STORAGE_KEY } = require('../support/test-account');
const test = base.extend({
  page: async ({ storageState }, use) => {
    // Der Zustand wird wie beim Context-Aufbau vor der Workspace-Fixture kopiert.
    const state = typeof storageState === 'string'
      ? JSON.parse(readFileSync(storageState, 'utf8')) : structuredClone(storageState);
    await use({ state, addInitScript: async () => {} });
  },
});
function session(page) {
  return JSON.parse(page.state.origins[0].localStorage.find(item => item.name === AUTH_STORAGE_KEY).value);
}
async function coherent(page, workspace) {
  const observed = await fetch(${JSON.stringify(url)} + '/fixture/workspace/' + workspace.id).then(r => r.json());
  expect(observed.accessToken).toBe(session(page).access_token);
  const identity = await workspace.client.auth.getUser();
  expect(identity.error).toBeNull();
  expect(identity.data.user.id).toBe(${JSON.stringify(userId)});
}
async function workerReady(page, worker) {
  await fetch(${JSON.stringify(url)} + '/fixture/workers', {
    method: 'POST', body: JSON.stringify({ worker, accessToken: session(page).access_token }),
  });
}
module.exports = { test, expect, session, coherent, workerReady };`,
  );
  return {
    directory,
    logins,
    workspaceTokens,
    workerTokens,
    async run() {
      const env = { ...process.env };
      for (const key of [
        'PLAYWRIGHT_JSON_OUTPUT_FILE',
        'PLAYWRIGHT_JSON_OUTPUT_NAME',
        'PLAYWRIGHT_JSON_OUTPUT_DIR',
      ])
        delete env[key];
      try {
        const { stdout } = await executeFile(
          process.execPath,
          [
            join(root, 'node_modules/@playwright/test/cli.js'),
            'test',
            '--config=contract.config.js',
          ],
          { cwd: directory, env, timeout: 45000, maxBuffer: 2 * 1024 * 1024 },
        );
        return { exitCode: 0, report: JSON.parse(stdout) };
      } catch (error) {
        if (!error.stdout) throw error;
        return { exitCode: error.code, report: JSON.parse(error.stdout) };
      }
    },
  };
}

test('erneuert E2E-Sitzungen vor dem nächsten Context und trennt parallele Worker', async (context) => {
  const harness = await sessionHarness(context);
  await writeFile(
    join(harness.directory, 'e2e/contracts/lifetime.spec.js'),
    `const { test, expect, session, coherent, workerReady } = require('./fixture');
const originalNow = Date.now;
let firstToken, renewedToken;
test.afterAll(() => { Date.now = originalNow; });
test('Browserstate und Workspace beginnen mit derselben Sitzung', async ({ page, workspace }, info) => {
  await coherent(page, workspace);
  await workerReady(page, info.workerIndex);
  firstToken = session(page).access_token;
  const boundary = session(page).expires_at - 120;
  Date.now = () => boundary * 1000;
});
test('120 Sekunden Restgültigkeit verwenden die Worker-Sitzung weiter', async ({ page, workspace }) => {
  await coherent(page, workspace);
  expect(session(page).access_token).toBe(firstToken);
  const nearExpiry = session(page).expires_at - 119;
  Date.now = () => nearExpiry * 1000;
});
test('unter 120 Sekunden kommt vor dem nächsten Context eine neue Sitzung', async ({ page, workspace }) => {
  await coherent(page, workspace);
  renewedToken = session(page).access_token;
  expect(renewedToken).not.toBe(firstToken);
  expect(session(page).expires_at - Math.floor(Date.now() / 1000)).toBeGreaterThanOrEqual(120);
  const expired = session(page).expires_at + 1;
  Date.now = () => expired * 1000;
});
test('auch eine vollständig abgelaufene Sitzung wird regulär neu angemeldet', async ({ page, workspace }) => {
  await coherent(page, workspace);
  expect(session(page).access_token).not.toBe(renewedToken);
});
test.describe('bewusst anonymer Context', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('behält den leeren Zustand', async ({ page }) => {
    expect(page.state).toEqual({ cookies: [], origins: [] });
  });
});
test.describe('eigener Contextzustand', () => {
  const ownState = { cookies: [], origins: [{ origin: 'http://127.0.0.1:4200', localStorage: [{ name: 'own-session', value: 'owned' }] }] };
  test.use({ storageState: ownState });
  test('behält seine eigene Sitzung', async ({ page }) => { expect(page.state).toEqual(ownState); });
});`,
  );
  await writeFile(
    join(harness.directory, 'e2e/contracts/parallel.spec.js'),
    `const { test, coherent, workerReady } = require('./fixture');
test('zweiter Worker meldet dasselbe lokale Konto unabhängig an', async ({ page, workspace }, info) => {
  await coherent(page, workspace);
  await workerReady(page, info.workerIndex);
});`,
  );
  const { exitCode, report } = await harness.run();
  assert.equal(exitCode, 0, JSON.stringify(report.errors?.length ? report.errors : report.suites));
  assert.equal(report.stats.expected, 7);
  assert.equal(report.stats.unexpected, 0);
  assert.equal(harness.logins.length, 5, 'Ein globaler Login, zwei Worker und zwei Erneuerungen.');
  assert.equal(new Set(harness.workerTokens.values()).size, 2);
  for (const token of harness.workerTokens.values()) assert.notEqual(token, harness.logins[0]);
  const originalState = JSON.parse(
    await readFile(join(harness.directory, 'e2e/.auth/session.json'), 'utf8'),
  );
  assert.equal(
    JSON.parse(originalState.origins[0].localStorage[0].value).access_token,
    harness.logins[0],
  );
});

test('abgelehnte, zu kurze oder ungültige Anmeldung bricht vor dem Workspace ab', async (context) => {
  // Supabase rundet expires_in auf volle Sekunden; 60s liegen sicher unter der 120s-Grenze.
  for (const options of [{ loginFailure: true }, { sessionSeconds: 60 }, { invalidExpiry: true }]) {
    const harness = await sessionHarness(context, options);
    await writeFile(
      join(harness.directory, 'e2e/contracts/rejected.spec.js'),
      `const { test } = require('./fixture');
test('darf keine unbrauchbare Sitzung einsetzen', async ({ workspace }) => {});`,
    );
    const { exitCode, report } = await harness.run();
    assert.equal(exitCode, 1);
    assert.equal(report.stats.unexpected, 1);
    assert.equal(harness.workspaceTokens.size, 0);
    const error = report.suites[0].specs[0].tests[0].results[0].error.message;
    assert.match(
      error,
      options.loginFailure
        ? /Anmeldung absichtlich abgelehnt/u
        : options.invalidExpiry
          ? /Ablaufdatum/u
          : /120 Sekunden/u,
    );
  }
});
