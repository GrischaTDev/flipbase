import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const [image, directory, commit] = process.argv.slice(2);
if (!image || !directory || !/^[a-f0-9]{40}$/u.test(commit ?? ''))
  throw new Error('Image, function artifact and commit required');
const suffix = process.pid;
const network = `push-functions-smoke-${suffix}`;
const functions = `push-functions-smoke-${suffix}`;
const gateway = `push-gateway-smoke-${suffix}`;
const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
docker('network', 'create', network);
try {
  docker(
    'run',
    '-d',
    '--name',
    functions,
    '--network',
    network,
    '--network-alias',
    'push-functions',
    '--mount',
    `type=bind,source=${resolve(directory)},target=/home/deno/functions,readonly`,
    '-e',
    'SUPABASE_URL=http://127.0.0.1:1',
    '-e',
    'SUPABASE_SERVICE_ROLE_KEY=smoke-test-service-key',
    '-e',
    'SUPABASE_ANON_KEY=smoke-test-anon-key',
    '-e',
    `FLIPBASE_COMMIT=${commit}`,
    'public.ecr.aws/supabase/edge-runtime:v1.73.5',
    'start',
    '--main-service',
    '/home/deno/functions/push-main',
  );
  docker(
    'run',
    '-d',
    '--name',
    gateway,
    '--network',
    network,
    '-e',
    'PUSH_PROCESS=gateway',
    '-p',
    '127.0.0.1::4177',
    image,
  );
  const port = docker('port', gateway, '4177/tcp').split(':').pop();
  const base = `http://127.0.0.1:${port}`;
  let health;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${base}/healthz`);
      if (response.ok) {
        health = await response.json();
        break;
      }
    } catch {
      /* Runtimeinitialisierung abwarten. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(health?.healthy, true);
  assert.equal(health.commit, commit);
  assert.equal(health.functionsCommit, commit);
  const post = (name) =>
    fetch(`${base}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app.flipbase.de' },
      body: '{}',
    });
  assert.equal((await post('push-settings')).status, 401, 'Settingsfunktion prueft Auth selbst');
  docker(
    'exec',
    gateway,
    'node',
    '-e',
    `Promise.all([
    fetch('http://push-functions:9000/ebay-order-observer',{method:'POST',body:'{}'}),
    fetch('http://push-functions:9000/ebay-order-observer',{method:'POST',headers:{Authorization:'Bearer smoke-test-service-key'},body:'{}'}),
    fetch('http://push-functions:9000/ebay-order-observer',{method:'POST',headers:{Authorization:'Bearer smoke-test-service-key',Origin:'https://app.flipbase.de'},body:'{}'})
  ]).then(responses=>{if(responses.map(response=>response.status).join(',')!=='401,503,401')process.exit(1)}).catch(()=>process.exit(1))`,
  );
  assert.equal(
    (await post('ebay-order-observer')).status,
    404,
    'Interner Observer besitzt keine Gatewayroute',
  );
  for (let attempt = 0; attempt < 9; attempt++) {
    const response = await post('push-revoke');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { revoked: true });
  }
  assert.equal((await post('push-revoke')).status, 429, 'Gateway sperrt weitere Widerrufe vor SQL');
  assert.equal(
    (await fetch(`${base}/functions/v1/push-revoke`, { method: 'POST', body: 'x'.repeat(513) }))
      .status,
    413,
  );
  assert.equal(
    (await fetch(`${base}/functions/v1/other`, { method: 'POST', body: '{}' })).status,
    404,
  );
  console.log(
    'Push functions and gateway healthy; authentication, revoke, limits and commit verified.',
  );
} catch (error) {
  // Diese isolierten Container haben ausschliesslich Testschluessel.
  process.stderr.write(docker('logs', functions) + '\n' + docker('logs', gateway) + '\n');
  throw error;
} finally {
  for (const container of [gateway, functions]) {
    try {
      docker('rm', '-f', container);
    } catch {
      /* Startfehler haben eventuell keinen Container erzeugt. */
    }
  }
  docker('network', 'rm', network);
}
