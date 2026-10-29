import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import { getCheckCommands } from './ci-checks.mjs';
import { createHash } from 'node:crypto';

const deployScript = fileURLToPath(new URL('../deploy/deploy.sh', import.meta.url));
const dockerfile = fileURLToPath(new URL('../docker/Dockerfile', import.meta.url));

test('Push-Smoke meldet den ursprünglichen Startfehler auch ohne erzeugte Container', async () => {
  const script = await readFile(
    new URL('../services/push-worker/scripts/smoke-functions.mjs', import.meta.url),
    'utf8',
  );
  const startupError = new Error('fixture: runtime image could not be fetched');
  const commands = [];
  const execution = vm.runInNewContext(
    `(async () => { ${script.replace(/^import .*;\r?\n/gmu, '')} })()`,
    {
      assert,
      resolve: (path) => path,
      process: {
        argv: ['node', 'smoke-functions.mjs', 'fixture-image', '/fixture', 'a'.repeat(40)],
        pid: 123,
        stderr: { write() {} },
      },
      execFileSync: (_command, args) => {
        commands.push([...args]);
        if (args[0] === 'run') throw startupError;
        if (args[0] === 'logs') throw new Error('fixture: no such container');
        return '';
      },
    },
  );
  await assert.rejects(execution, (error) => error === startupError);
  assert.ok(
    commands.find((args) => args[0] === 'run')?.includes('ghcr.io/supabase/edge-runtime:v1.73.5'),
    'Unveränderte Runtime-Version aus der offiziellen GHCR-Registry',
  );
  assert.deepEqual(
    commands.filter((args) => args[0] === 'logs').map((args) => args[1]),
    ['push-functions-smoke-123', 'push-gateway-smoke-123'],
  );
  assert.ok(commands.some((args) => args.join(' ') === 'network rm push-functions-smoke-123'));
});

test('Produktions-Nginx akzeptiert die tatsächlichen Auslieferungsregeln', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const source = await readFile(dockerfile, 'utf8');
  const image = source.match(/^FROM (nginx:[^\s]+) AS production$/mu)?.[1];
  assert.ok(image, 'Die Prüfung muss das tatsächliche Produktions-Nginx verwenden.');
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--mount',
      `type=bind,source=${join(root, 'docker/nginx.conf')},target=/etc/nginx/conf.d/default.conf,readonly`,
      '--mount',
      `type=bind,source=${join(root, 'docker/security-headers.conf')},target=/etc/nginx/security-headers.conf,readonly`,
      image,
      'nginx',
      '-t',
    ],
    { stdio: 'pipe' },
  );
  const archiveRoot = await mkdtemp(join(tmpdir(), 'flipbase-nginx-archive-'));
  const container = `flipbase-archive-${process.pid}-${Date.now()}`;
  try {
    // mkdtemp setzt 0700; wie beim echten öffentlichen Archiv muss auch
    // der unprivilegierte Nginx-Prozess dieses Verzeichnis betreten können.
    await chmod(archiveRoot, 0o755);
    await mkdir(join(archiveRoot, 'a'.repeat(64)), { mode: 0o755 });
    await writeFile(join(archiveRoot, 'a'.repeat(64), 'old.js'), 'previous bytes', { mode: 0o644 });
    execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        container,
        '--mount',
        `type=bind,source=${join(root, 'docker/nginx.conf')},target=/etc/nginx/conf.d/default.conf,readonly`,
        '--mount',
        `type=bind,source=${join(root, 'docker/security-headers.conf')},target=/etc/nginx/security-headers.conf,readonly`,
        '--mount',
        `type=bind,source=${archiveRoot},target=/usr/share/nginx/html/app-builds,readonly`,
        image,
      ],
      { stdio: 'pipe' },
    );
    // HTTP im tatsächlichen Nginx-Container funktioniert auch bei einem
    // getrennten Docker-Daemon, ohne Hostports oder fremde Netzwerke zu ändern.
    const request = (path) =>
      spawnSync('docker', ['exec', container, 'wget', '-S', '-O', '-', `http://127.0.0.1${path}`], {
        encoding: 'utf8',
      });
    let ready;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      ready = request('/healthz');
      if (ready.status === 0) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    assert.equal(ready?.status, 0, ready?.stderr);
    const response = request(`/app-builds/${'a'.repeat(64)}/old.js`);
    assert.equal(response.status, 0, response.stderr);
    assert.match(response.stderr, /HTTP\/1\.1 200/);
    assert.equal(response.stdout, 'previous bytes');
    assert.match(response.stderr, /Cache-Control:.*immutable/i);
    const missing = request(`/app-builds/${'a'.repeat(64)}/missing.js`);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /HTTP\/1\.1 404/);
    assert.match(response.stderr, /Content-Security-Policy:/i);
  } finally {
    execFileSync('docker', ['rm', '-f', container], { stdio: 'pipe' });
    await rm(archiveRoot, { recursive: true, force: true });
  }
});

test('Push-Compose erbt Supabasezugang und trennt Router/JWT ohne neue Hostports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-push-compose-'));
  try {
    const base = join(root, 'docker-compose.yml');
    await writeFile(
      base,
      `services:
  functions:
    image: supabase/edge-runtime:v1.73.5
    command: [start, --main-service, /home/deno/functions/main]
    environment:
      VERIFY_JWT: 'true'
      SUPABASE_URL: http://kong:8000
      SUPABASE_SERVICE_ROLE_KEY: fixture-server-only
    volumes:
      - ./original-functions:/home/deno/functions
`,
    );
    const compose = JSON.parse(
      execFileSync(
        'docker',
        [
          'compose',
          '-f',
          base,
          '-f',
          fileURLToPath(new URL('../deploy/docker-compose.push-functions.yml', import.meta.url)),
          'config',
          '--format',
          'json',
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PUSH_FUNCTIONS_DIRECTORY: join(root, 'release-functions'),
            FLIPBASE_SUPABASE_DIRECTORY: root,
            FLIPBASE_PUSH_IMAGE: `ghcr.io/grischatdev/flipbase-push@sha256:${'b'.repeat(64)}`,
            FLIPBASE_PUSH_COMMIT: 'a'.repeat(40),
          },
        },
      ),
    );
    assert.equal(compose.services.functions.environment.VERIFY_JWT, 'true');
    const functions = compose.services['push-functions'];
    assert.equal(functions.environment.VERIFY_JWT, 'false');
    assert.equal(functions.environment.SUPABASE_SERVICE_ROLE_KEY, 'fixture-server-only');
    assert.deepEqual(functions.command, [
      'start',
      '--main-service',
      '/home/deno/functions/push-main',
    ]);
    assert.equal(
      functions.volumes.filter((volume) => volume.target === '/home/deno/functions').length,
      1,
    );
    assert.equal(
      functions.volumes.find((volume) => volume.target === '/home/deno/functions').read_only,
      true,
    );
    assert.equal(functions.ports, undefined);
    const gateway = compose.services['push-gateway'];
    assert.equal(gateway.ports, undefined);
    assert.equal(gateway.environment.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal(gateway.read_only, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Geschuetzte Pushkonfiguration gilt fuer Functions und Worker mit Standard-aus und Kill-Switch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flipbase-push-runtime-'));
  const environmentFile = join(root, 'push.env');
  const supabaseEnvironmentFile = join(root, '.env');
  const defaultsEnvironmentFile = join(root, 'push-defaults.env');
  const base = join(root, 'docker-compose.yml');
  try {
    await writeFile(
      base,
      'services:\n  functions:\n    image: supabase/edge-runtime:v1.73.5\n    environment:\n      SUPABASE_URL: ${SUPABASE_URL}\n      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}\n',
    );
    await writeFile(
      supabaseEnvironmentFile,
      'SUPABASE_URL=http://kong:8000\nSUPABASE_SERVICE_ROLE_KEY=fixture-main-server-key\nWEB_PUSH_ENABLED=true\nWEB_PUSH_ALLOW_ALL=true\nWEB_PUSH_PILOT_USER_IDS=stale-main-user\nWEB_PUSH_PILOT_DEVICE_IDS=stale-main-device\nWEB_PUSH_VAPID_PUBLIC_KEY=stale-main-public-key\nWEB_PUSH_VAPID_KEY_ID=stale-main-key-id\nWEB_PUSH_ALLOWED_ORIGINS=https://stale.example.test\n',
    );
    const defaults =
      (await readFile(deployScript, 'utf8')).match(
        /^  cat > "\$PUSH_DEFAULTS_ENV_FILE" <<'PUSH_DEFAULTS'\n([\s\S]*?)\nPUSH_DEFAULTS$/mu,
      )?.[1] ?? '';
    await writeFile(defaultsEnvironmentFile, `${defaults}\n`);
    const environment = {
      ...process.env,
      PUSH_ENV_FILE: environmentFile,
      PUSH_FUNCTIONS_DIRECTORY: join(root, 'release-functions'),
      FLIPBASE_SUPABASE_DIRECTORY: root,
      FLIPBASE_PUSH_IMAGE: `ghcr.io/grischatdev/flipbase-push@sha256:${'b'.repeat(64)}`,
      FLIPBASE_PUSH_COMMIT: 'a'.repeat(40),
    };
    // Fremde Shellwerte sollen den Konfigurationsfall nicht beeinflussen.
    for (const variable of Object.keys(environment)) {
      if (variable.startsWith('WEB_PUSH_')) delete environment[variable];
    }
    const render = (worker, overrides = {}) =>
      JSON.parse(
        execFileSync(
          'docker',
          [
            'compose',
            ...(worker
              ? []
              : ['--env-file', supabaseEnvironmentFile, '--env-file', defaultsEnvironmentFile]),
            '--env-file',
            environmentFile,
            ...(worker ? [] : ['-f', base]),
            '-f',
            fileURLToPath(
              new URL(
                worker
                  ? '../deploy/docker-compose.push.yml'
                  : '../deploy/docker-compose.push-functions.yml',
                import.meta.url,
              ),
            ),
            'config',
            '--format',
            'json',
          ],
          { encoding: 'utf8', env: { ...environment, ...overrides } },
        ),
      ).services[worker ? 'push-worker' : 'push-functions'].environment;
    const protectedConfiguration = {
      WEB_PUSH_ENABLED: 'true',
      WEB_PUSH_ALLOW_ALL: 'false',
      WEB_PUSH_PILOT_USER_IDS: '11111111-1111-4111-8111-111111111111',
      WEB_PUSH_PILOT_DEVICE_IDS: '22222222-2222-4222-8222-222222222222',
      WEB_PUSH_VAPID_PUBLIC_KEY: 'fixture-public-key',
      WEB_PUSH_VAPID_KEY_ID: 'fixture-key-id',
      WEB_PUSH_ALLOWED_ORIGINS: 'https://app.example.test',
    };
    const configurationText = Object.entries(protectedConfiguration)
      .map(([name, setting]) => `${name}=${setting}\n`)
      .join('');
    await writeFile(environmentFile, configurationText, { mode: 0o600 });
    for (const worker of [false, true]) {
      const firstRelease = render(worker);
      const nextRelease = render(worker);
      for (const [name, setting] of Object.entries(protectedConfiguration)) {
        assert.equal(firstRelease[name], setting, name);
        assert.equal(nextRelease[name], setting, name);
      }
      const killed = render(worker, { WEB_PUSH_ENABLED: 'false', WEB_PUSH_ALLOW_ALL: 'false' });
      assert.equal(killed.WEB_PUSH_ENABLED, 'false');
      assert.equal(killed.WEB_PUSH_ALLOW_ALL, 'false');
      // Auch erlaubte Betriebsueberschreibungen muessen beide Dienste gleich erreichen.
      const overridden = render(worker, {
        WEB_PUSH_PILOT_USER_IDS: '33333333-3333-4333-8333-333333333333',
        WEB_PUSH_VAPID_KEY_ID: 'fixture-rotated-key-id',
      });
      assert.equal(overridden.WEB_PUSH_PILOT_USER_IDS, '33333333-3333-4333-8333-333333333333');
      assert.equal(overridden.WEB_PUSH_VAPID_KEY_ID, 'fixture-rotated-key-id');
    }
    assert.equal(await readFile(environmentFile, 'utf8'), configurationText);
    await writeFile(
      environmentFile,
      configurationText.replace('WEB_PUSH_ENABLED=true', 'WEB_PUSH_ENABLED=false'),
    );
    for (const worker of [false, true]) {
      const killed = render(worker);
      assert.equal(killed.WEB_PUSH_ENABLED, 'false');
      assert.equal(killed.WEB_PUSH_ALLOW_ALL, 'false');
      assert.equal(killed.WEB_PUSH_VAPID_KEY_ID, protectedConfiguration.WEB_PUSH_VAPID_KEY_ID);
    }
    await writeFile(environmentFile, 'SUPABASE_URL=https://api.example.test\n');
    for (const worker of [false, true]) {
      const disabled = render(worker);
      assert.equal(disabled.WEB_PUSH_ENABLED, 'false');
      assert.equal(disabled.WEB_PUSH_ALLOW_ALL, 'false');
      assert.equal(disabled.WEB_PUSH_PILOT_USER_IDS, '');
      assert.equal(disabled.WEB_PUSH_PILOT_DEVICE_IDS, '');
      assert.equal(disabled.WEB_PUSH_VAPID_PUBLIC_KEY, '');
      assert.equal(disabled.WEB_PUSH_VAPID_KEY_ID, '');
      assert.equal(disabled.WEB_PUSH_ALLOWED_ORIGINS, 'https://app.flipbase.de');
      if (!worker) {
        assert.equal(disabled.SUPABASE_URL, 'https://api.example.test');
        assert.equal(disabled.SUPABASE_SERVICE_ROLE_KEY, 'fixture-main-server-key');
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'Pushparser erzwingt Digest, gleiche Commits und Migration vor Functions/Worker/App',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'flipbase-push-deploy-'));
    const bin = join(root, 'bin');
    const runtime = join(root, 'push');
    const supabase = join(root, 'supabase');
    const artifact = join(root, 'artifact');
    const appSource = join(root, 'app-source');
    const log = join(root, 'calls.log');
    const appDigest = `sha256:${'a'.repeat(64)}`;
    const pushDigest = `sha256:${'b'.repeat(64)}`;
    const commit = 'a'.repeat(40);
    try {
      for (const directory of [bin, runtime, supabase]) await mkdir(directory, { recursive: true });
      await mkdir(appSource);
      const html = '<html>combined app and push release</html>';
      await writeFile(join(appSource, 'index.html'), html);
      await writeFile(
        join(appSource, 'pwa-assets.json'),
        JSON.stringify({
          version: 1,
          buildId: 'c'.repeat(64),
          assets: [{ url: '/index.html', sha256: createHash('sha256').update(html).digest('hex') }],
        }),
      );
      await writeFile(
        join(root, 'archive-app-build.py'),
        await readFile(new URL('../deploy/archive-app-build.py', import.meta.url)),
      );
      execFileSync(process.execPath, [
        fileURLToPath(new URL('./package-push-functions.mjs', import.meta.url)),
        artifact,
        commit,
      ]);
      await writeFile(join(supabase, 'docker-compose.yml'), 'services: {}\n');
      await writeFile(join(supabase, '.env'), 'TEST=true\n');
      await writeFile(join(root, 'Caddyfile'), 'old proxy configuration\n');
      const configurationText =
        'SUPABASE_URL=https://api.example.test\nWEB_PUSH_ENABLED=true\nWEB_PUSH_ALLOW_ALL=false\nWEB_PUSH_PILOT_USER_IDS=11111111-1111-4111-8111-111111111111\n';
      await writeFile(join(runtime, 'push.env'), configurationText, {
        mode: 0o600,
      });
      // Der CI-Nutzer ist kein root; nur die serverseitige Metadatenabfrage simulieren.
      await writeFile(
        join(bin, 'stat'),
        `#!/bin/bash
if [[ "$1" = -c && "$2" = '%u:%g:%a' && "$3" = "$FIXTURE_PUSH_ENV_FILE" ]]; then
  printf '%s\\n' "\${FIXTURE_PUSH_ENV_METADATA:-0:0:600}"
else
  exec /usr/bin/stat "$@"
fi
`,
        { mode: 0o755 },
      );
      // Die Commitabfrage bleibt simuliert; das App-Archiv wird mit dem echten
      // Python-Programm geprüft, auch bei einer gemeinsamen Pushauslieferung.
      await writeFile(
        join(bin, 'python3'),
        `#!/bin/bash
if [[ "$1" = -c && "$2" = 'import json,sys; print(json.load(open(sys.argv[1]))["commit"])' ]]; then
  exec node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).commit + "\\n")' "$3"
fi
exec /usr/bin/python3 "$@"
`,
        { mode: 0o755 },
      );
      await writeFile(join(root, 'migration-backup.sh'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
      await writeFile(
        join(root, 'apply-release-migrations.sh'),
        '#!/bin/bash\necho "apply migrations" >> "$DOCKER_LOG"\n',
        { mode: 0o755 },
      );
      await writeFile(
        join(bin, 'docker'),
        `#!/bin/bash
echo "$*" >> "$DOCKER_LOG"
case "$1" in
 login) cat >/dev/null ;;
 create) echo artifact-container ;;
 cp)
  case "$2" in
   *:*/archive-app-build.py) cp "$REPO_ROOT/deploy/archive-app-build.py" "$3" ;;
   *:*/usr/share/nginx/html/.) cp -R "$APP_SOURCE/." "$3" ;;
   *:*/push-functions) cp -a "$FUNCTION_ARTIFACT" "$3" ;;
   *:*/docker-compose.push.yml) cp "$REPO_ROOT/deploy/docker-compose.push.yml" "$3" ;;
   *:*/docker-compose.push-functions.yml) cp "$REPO_ROOT/deploy/docker-compose.push-functions.yml" "$3" ;;
   *:*/Caddyfile) cp "$REPO_ROOT/deploy/Caddyfile" "$3" ;;
   *:*/migrations/.) mkdir -p "$3" ;;
   *) exit 92 ;;
  esac ;;
 compose)
  if [[ "$*" = *"docker-compose.push"* ]]; then
    [[ "$*" = *"--env-file $FIXTURE_PUSH_ENV_FILE"* ]] || exit 93
    [[ ! -v WEB_PUSH_ENABLED && ! -v WEB_PUSH_ALLOW_ALL ]] || exit 94
    if [[ "$*" = *"docker-compose.push-functions.yml"* ]]; then
      [[ "$*" = *"--env-file .env --env-file $PUSH_DEFAULTS_ENV_FILE --env-file $FIXTURE_PUSH_ENV_FILE"* ]] || exit 96
      [[ -f "$PUSH_DEFAULTS_ENV_FILE" && "$(stat -c '%a' "$PUSH_DEFAULTS_ENV_FILE")" = 600 ]] || exit 97
      grep -qx 'WEB_PUSH_ENABLED=false' "$PUSH_DEFAULTS_ENV_FILE" || exit 98
      grep -qx 'WEB_PUSH_ALLOW_ALL=false' "$PUSH_DEFAULTS_ENV_FILE" || exit 98
    fi
  fi
  case "$*" in
   *"config --images web"*) echo "$EXPECTED_APP_IMAGE" ;;
   *"config --images push-worker"*) echo "\${CONFIGURED_PUSH_IMAGE:-$EXPECTED_PUSH_IMAGE}" ;;
  esac ;;
 inspect)
  case "$*" in
   *org.opencontainers.image.revision*) echo "\${PUSH_REVISION:-$EXPECTED_COMMIT}" ;;
   *State.Health.Status*) echo healthy ;;
   *) echo sha256:fixture ;;
  esac ;;
 exec)
  if [[ "$2" = flipbase-web && "$3" = tar ]]; then tar -C "$APP_SOURCE" -cf - .; fi ;;
 pull|up|rm|logout|image) ;;
 *) exit 91 ;;
esac
`,
        { mode: 0o755 },
      );
      const environment = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        FLIPBASE_DEPLOY_DIR: root,
        FLIPBASE_LANDING_DIR: join(root, 'absent'),
        FLIPBASE_CADDY_CONFIG_PATH: join(root, 'Caddyfile'),
        FLIPBASE_PUSH_RUNTIME_DIRECTORY: runtime,
        FLIPBASE_SUPABASE_DIRECTORY: supabase,
        SSH_ORIGINAL_COMMAND: `release-v1 ${appDigest} push ${pushDigest}`,
        DOCKER_LOG: log,
        FUNCTION_ARTIFACT: artifact,
        APP_SOURCE: appSource,
        REPO_ROOT: fileURLToPath(new URL('../', import.meta.url)),
        EXPECTED_APP_IMAGE: `ghcr.io/grischatdev/flipbase@${appDigest}`,
        EXPECTED_PUSH_IMAGE: `ghcr.io/grischatdev/flipbase-push@${pushDigest}`,
        EXPECTED_COMMIT: commit,
        FIXTURE_PUSH_ENV_FILE: join(runtime, 'push.env'),
      };
      const result = await runDeploy(environment);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(
        await readFile(join(root, 'app-builds', 'c'.repeat(64), 'index.html'), 'utf8'),
        html,
      );
      assert.equal(await readFile(join(runtime, 'push.env'), 'utf8'), configurationText);
      const nextRelease = await runDeploy(environment);
      assert.equal(nextRelease.code, 0, nextRelease.stderr);
      assert.equal(await readFile(join(runtime, 'push.env'), 'utf8'), configurationText);
      for (const metadata of ['1001:1001:600', '0:0:644']) {
        const rejected = await runDeploy({ ...environment, FIXTURE_PUSH_ENV_METADATA: metadata });
        assert.equal(rejected.code, 1, metadata);
        assert.match(rejected.stderr, /root-Konfiguration mit Modus0600/u);
      }
      const linkedConfiguration = join(root, 'linked-push.env');
      await symlink(join(runtime, 'push.env'), linkedConfiguration);
      const linkedResult = await runDeploy({ ...environment, PUSH_ENV_FILE: linkedConfiguration });
      assert.equal(linkedResult.code, 1);
      assert.match(linkedResult.stderr, /root-Konfiguration mit Modus0600/u);
      const calls = await readFile(log, 'utf8');
      assert.match(
        calls,
        /caddy reload/u,
        'Push routing must activate without a landing directory',
      );
      assert.ok(
        calls.indexOf('apply migrations') <
          calls.indexOf('up -d --no-deps --pull never push-functions push-gateway'),
      );
      assert.ok(
        calls.indexOf('up -d --no-deps --pull never push-functions push-gateway') <
          calls.indexOf('up -d --pull never push-worker'),
      );
      assert.ok(
        calls.indexOf('up -d --pull never push-worker') < calls.indexOf('up -d --pull never web'),
      );
      for (const command of [
        `release-v1 ${appDigest} push latest`,
        `release-v1 ${appDigest} push sha-1234567`,
        `release-v1 ${appDigest} push ${pushDigest} push ${pushDigest}`,
        `web sha-1234567 push ${pushDigest}`,
        `push ${pushDigest};echo pwn`,
        `release-v1 ${appDigest} other ${pushDigest}`,
      ])
        assert.equal(
          (await runDeploy({ ...environment, SSH_ORIGINAL_COMMAND: command })).code,
          2,
          command,
        );
      await writeFile(log, '');
      assert.notEqual((await runDeploy({ ...environment, PUSH_REVISION: 'b'.repeat(40) })).code, 0);
      assert.doesNotMatch(await readFile(log, 'utf8'), /up -d/);
      await writeFile(log, '');
      assert.notEqual(
        (
          await runDeploy({
            ...environment,
            CONFIGURED_PUSH_IMAGE: 'ghcr.io/grischatdev/flipbase-push:latest',
          })
        ).code,
        0,
      );
      assert.doesNotMatch(await readFile(log, 'utf8'), /up -d/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test('Pushrelease liefert Functions, Ratelimit und Digest vor der kompatiblen App', async () => {
  const [deploy, image, proxy, workflow] = await Promise.all([
    readFile(deployScript, 'utf8'),
    readFile(dockerfile, 'utf8'),
    readFile(new URL('../deploy/Caddyfile', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
  ]);
  assert.match(deploy, /PUSH_REFERENCE/u);
  assert.match(deploy, /prepare_push_runtime/u);
  assert.ok(
    deploy.indexOf('apply-release-migrations.sh" "$temporary/migrations"') <
      deploy.indexOf('activate_push_runtime "$release_container"'),
  );
  assert.ok(
    deploy.indexOf('activate_push_runtime "$release_container"') <
      deploy.indexOf('docker compose up -d --pull never web'),
  );
  assert.match(image, /release-push-functions \/opt\/flipbase\/push-functions/u);
  assert.match(proxy, /reverse_proxy flipbase-push-gateway:4177/u);
  assert.match(proxy, /header_up X-Forwarded-For \{remote_host\}/u);
  assert.ok(proxy.indexOf('handle @push_requests') < proxy.indexOf('handle @supabase_api'));
  assert.match(
    workflow,
    /if: \$\{\{ needs\.changes\.outputs\.push == 'true' \}\}\s+run: node scripts\/ci-checks\.mjs push/u,
  );
  assert.ok(
    getCheckCommands('push').some(
      ({ command, args }) =>
        command === 'npm' &&
        JSON.stringify(args) ===
          JSON.stringify(['ci', '--prefix', 'services/push-worker', '--ignore-scripts']),
    ),
  );
  assert.match(workflow, /push_digest:/u);
  assert.match(workflow, /Gate publication on successful checks/u);
});

test('der Botbrowser wird privat geroutet und mit dem geprüften Release vorbereitet', async () => {
  const [caddy, compose, deploy, webImage] = await Promise.all([
    readFile(new URL('../deploy/Caddyfile', import.meta.url), 'utf8'),
    readFile(new URL('../deploy/docker-compose.sniper.yml', import.meta.url), 'utf8'),
    readFile(deployScript, 'utf8'),
    readFile(dockerfile, 'utf8'),
  ]);
  assert.match(caddy, /handle @sniper_browser\s*\{\s*reverse_proxy 172\.18\.0\.1:8081/u);
  assert.doesNotMatch(caddy, /9228|\/json\/|sniper.*168\.119/u);
  assert.match(compose, /SNIPER_BROWSER_HOST: 172\.18\.0\.1/u);
  assert.match(compose, /shm_size: 128m/u);
  assert.match(compose, /stop_grace_period: 90s/u);
  assert.match(compose, /mem_limit: 2g/u);
  assert.match(compose, /memswap_limit: 3g/u);
  assert.match(compose, /SYS_CHROOT/u);
  assert.match(compose, /seccomp:/u);
  assert.match(
    webImage,
    /\/app\/deploy\/docker-compose\.sniper\.yml \/opt\/flipbase\/docker-compose\.sniper\.yml/u,
  );
  const preparation = deploy.indexOf('prepare_sniper_browser_runtime');
  const start = deploy.indexOf('up -d --pull never sniper');
  assert.ok(preparation >= 0 && start > preparation);
  assert.match(
    deploy,
    /docker cp "\$artifact_container":\/opt\/flipbase\/docker-compose\.sniper\.yml/u,
  );
  assert.match(deploy, /SUPABASE_ANON_KEY/u);
});

test('öffentliche Proxy-Regeln sperren beide MCP-Einstiegspunkte vor der API-Freigabe', async () => {
  const configuration = await readFile(new URL('../deploy/Caddyfile', import.meta.url), 'utf8');
  const publicMatcher = configuration.match(/^\s*@supabase_api path (.+)$/mu)?.[1].split(/\s+/u);
  assert.ok(publicMatcher, 'Die erlaubten öffentlichen API-Pfade müssen ausdrücklich sein.');
  assert.ok(
    publicMatcher.every(
      (path) => !['/mcp', '/mcp/*', '/api/mcp', '/api/mcp/*', '/*'].includes(path),
    ),
    'Verwaltungszugriff darf nicht von einer öffentlichen API-Freigabe erfasst werden.',
  );
  const blockedMatcher = configuration.match(/^\s*@supabase_mcp path (.+)$/mu)?.[1].split(/\s+/u);
  for (const path of ['/mcp', '/mcp/*', '/api/mcp', '/api/mcp/*'])
    assert.ok(blockedMatcher?.includes(path), `MCP-Einstiegspunkt ${path} muss gesperrt sein.`);
  assert.match(configuration, /handle @supabase_mcp\s*\{\s*respond 404\s*\}/u);
  assert.ok(
    configuration.indexOf('handle @supabase_mcp') < configuration.indexOf('handle @supabase_api'),
  );
});

test('jede öffentliche TLS-Domain erhält HSTS ohne pauschale Subdomainbindung', async () => {
  const configuration = await readFile(new URL('../deploy/Caddyfile', import.meta.url), 'utf8');
  const sites = configuration
    .split(/^(?=\S.*\{$)/mu)
    .filter((section) => /^\S.*\{$/mu.test(section));
  assert.equal(sites.length, 5);
  for (const site of sites) {
    assert.match(site, />Strict-Transport-Security "max-age=300"/u);
    assert.doesNotMatch(site, /Strict-Transport-Security "[^"]*(?:includeSubDomains|preload)/u);
  }
});

test('Docker-Kontext enthält alle Quellen des tatsächlich erzeugten Pushpakets', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const artifact = await mkdtemp(join(tmpdir(), 'flipbase-push-context-'));
  try {
    execFileSync(process.execPath, [
      join(root, 'scripts/package-push-functions.mjs'),
      artifact,
      'a'.repeat(40),
    ]);
    const rules = (await readFile(join(root, '.dockerignore'), 'utf8')).split(/\r?\n/u);
    const manifest = await readFile(join(artifact, 'manifest.sha256'), 'utf8');
    const files = manifest
      .trim()
      .split('\n')
      .map((entry) => entry.slice(66));
    assert.ok(files.length > 1, 'Die Prüfung muss das tatsächliche Functionpaket erfassen.');
    for (const file of files) {
      if (file === 'deployment.json') continue;
      if (file.startsWith('push-main/')) {
        const source = `deploy/${file}`;
        for (const exclusion of [
          'deploy',
          'deploy/',
          'deploy/*',
          'deploy/push-main/',
          'deploy/push-main/*',
          source,
        ])
          assert.ok(
            !rules.includes(exclusion),
            `${source} wird aus dem Docker-Kontext ausgeschlossen.`,
          );
        continue;
      }
      const source = `supabase/functions/${file}`;
      assert.ok(
        rules.lastIndexOf(`!${source}`) > rules.lastIndexOf(`${posix.dirname(source)}/*`),
        `${source} fehlt im Docker-Kontext des Pushpakets.`,
      );
    }
  } finally {
    await rm(artifact, { recursive: true, force: true });
  }
});

test('Docker-Kontext enthält alle von Angular verwendeten gemeinsamen Verträge', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const rules = (await readFile(join(root, '.dockerignore'), 'utf8')).split(/\r?\n/u);
  const sharedPrefix = 'supabase/functions/_shared/';
  const resolveContractFile = (directory, modulePath) => {
    const contractPath = posix.join(directory, modulePath);
    if (/\.[cm]?ts$/u.test(contractPath)) return contractPath;
    return existsSync(join(root, `${contractPath}.ts`))
      ? `${contractPath}.ts`
      : `${contractPath}.d.ts`;
  };
  const pending = new Set();
  for (const file of await readdir(join(root, 'src'), { recursive: true })) {
    if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
    const source = await readFile(join(root, 'src', file), 'utf8');
    for (const match of source.matchAll(/['"][^'"]*supabase\/functions\/_shared\/([^'"]+)['"]/gu)) {
      pending.add(resolveContractFile(sharedPrefix, match[1]));
    }
  }
  assert.ok(pending.size > 0, 'Die Prüfung muss tatsächliche Angular-Importe erfassen.');
  for (const file of pending) {
    if (file.startsWith(sharedPrefix)) {
      const allowIndex = rules.lastIndexOf(`!${file}`);
      assert.ok(
        allowIndex > rules.lastIndexOf(`${sharedPrefix}*`),
        `${file} fehlt im Docker-Kontext.`,
      );
    }
    const source = await readFile(join(root, file), 'utf8');
    for (const match of source.matchAll(/from ['"](\.\.?\/[^'"]+)['"]/gu)) {
      pending.add(resolveContractFile(posix.dirname(file), match[1]));
    }
  }
});

test('liefert die passende Caddy-Regel vor der Landingpage aus', async () => {
  const [deploySource, dockerfileSource] = await Promise.all([
    readFile(deployScript, 'utf8'),
    readFile(dockerfile, 'utf8'),
  ]);

  assert.match(
    dockerfileSource,
    /COPY --from=build \/app\/deploy\/Caddyfile \/opt\/flipbase\/Caddyfile/u,
    'Das Release-Abbild muss die geprüfte Caddy-Konfiguration enthalten.',
  );

  const caddyCopy = deploySource.indexOf('docker cp flipbase-web:/opt/flipbase/Caddyfile');
  const caddyReloadAfterCopy = deploySource
    .slice(caddyCopy)
    .search(/caddy reload\s+\\\s*\n\s*--config \/etc\/caddy\/Caddyfile/u);
  const landingCopy = deploySource.indexOf(
    'docker cp flipbase-web:/usr/share/nginx/landing/. "$LANDING_DIRECTORY"/',
  );
  const caddyActivation = deploySource.lastIndexOf(
    'activate_release_caddy_configuration',
    landingCopy,
  );
  const caddyRestoreAfterLandingCopy = deploySource
    .slice(landingCopy)
    .indexOf('restore_caddy_configuration');

  assert.ok(caddyCopy >= 0, 'Das Deployment muss das Caddyfile aus demselben Abbild lesen.');
  assert.ok(caddyReloadAfterCopy >= 0, 'Caddy muss nach dem Kopieren neu geladen werden.');
  assert.ok(
    landingCopy > caddyActivation,
    'Die neue Landingpage darf erst nach der passenden CSP-Regel sichtbar werden.',
  );
  assert.ok(
    caddyRestoreAfterLandingCopy >= 0,
    'Ein fehlgeschlagener Landing-Abgleich muss die vorherige Caddy-Konfiguration wiederherstellen.',
  );
});

test(
  'Digest-Release sperrt SQL-Fehler vor Containerstart und verwendet denselben Digest',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'flipbase-release-'));
    const bin = join(root, 'bin');
    await mkdir(bin);
    const digest = `sha256:${'a'.repeat(64)}`;
    const image = `ghcr.io/grischatdev/flipbase@${digest}`;
    try {
      await writeFile(
        join(bin, 'docker'),
        `#!/bin/bash
case "$1" in
 login) cat >/dev/null ;;
 pull) [[ "$2" == "$EXPECTED_IMAGE" ]] || exit 90 ;;
 create) [[ "$2" == "$EXPECTED_IMAGE" ]] || exit 91; echo release-fixture ;;
 cp)
   case "$2" in
     */archive-app-build.py)
       [[ "\${MISSING_ARCHIVER:-0}" != 1 ]] || exit 1
       cp "$ARCHIVE_SCRIPT" "$3" ;;
     */usr/share/nginx/html/.) cp -R "$APP_SOURCE/." "$3" ;;
   esac ;;
 exec) tar -C "$APP_SOURCE" -cf - . ;;
 rm|logout|image) ;;
 compose) [[ "$FLIPBASE_IMAGE" == "$EXPECTED_IMAGE" ]] || exit 92; if [[ "$2" == config ]]; then echo "\${CONFIGURED_IMAGE:-$EXPECTED_IMAGE}"; else echo start; fi ;;
 inspect) echo healthy ;;
 *) exit 93 ;;
esac
`,
        { mode: 0o755 },
      );
      await writeFile(
        join(root, 'apply-release-migrations.sh'),
        '#!/bin/bash\nexit "${MIGRATION_STATUS:-0}"\n',
        { mode: 0o755 },
      );
      await writeFile(join(root, 'migration-backup.sh'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
      const appSource = join(root, 'app-source');
      await mkdir(appSource);
      const html = '<html>versioned release</html>';
      const buildId = 'b'.repeat(64);
      await writeFile(join(appSource, 'index.html'), html);
      await writeFile(
        join(appSource, 'pwa-assets.json'),
        JSON.stringify({
          version: 1,
          buildId,
          assets: [{ url: '/index.html', sha256: createHash('sha256').update(html).digest('hex') }],
        }),
      );
      const archiveScript = join(root, 'archive-app-build.py');
      await writeFile(
        archiveScript,
        await readFile(new URL('../deploy/archive-app-build.py', import.meta.url)),
      );
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FLIPBASE_DEPLOY_DIR: root,
        FLIPBASE_LANDING_DIR: join(root, 'absent'),
        SSH_ORIGINAL_COMMAND: `release-v1 ${digest}`,
        EXPECTED_IMAGE: image,
        ARCHIVE_SCRIPT: archiveScript,
        APP_SOURCE: appSource,
      };
      const success = await runDeploy(env);
      assert.equal(success.code, 0, success.stderr);
      assert.match(success.stdout, /start/);
      assert.equal(await readFile(join(root, 'app-builds', buildId, 'index.html'), 'utf8'), html);
      const historical = await runDeploy({ ...env, MISSING_ARCHIVER: '1' });
      assert.equal(historical.code, 0, historical.stderr);
      assert.match(historical.stdout, /start/);
      const outdated = await runDeploy({
        ...env,
        CONFIGURED_IMAGE: 'ghcr.io/grischatdev/flipbase:latest',
      });
      assert.notEqual(outdated.code, 0, 'Veraltetes Compose muss vor Migrationen stoppen');
      assert.doesNotMatch(outdated.stdout, /start/);
      const failed = await runDeploy({ ...env, MIGRATION_STATUS: '42' });
      assert.equal(failed.code, 42, failed.stderr);
      assert.doesNotMatch(failed.stdout, /start/);
      for (const command of [
        'release-v1 latest',
        `release-v1 ${digest} extra`,
        '$(touch /tmp/not-allowed)',
        `release-v1 sha256:${'a'.repeat(65)}`,
      ]) {
        assert.equal((await runDeploy({ ...env, SSH_ORIGINAL_COMMAND: command })).code, 2);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  },
);

function runDeploy(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [deployScript], {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test(
  'meldet einen fehlgeschlagenen Landing-Abgleich als fehlgeschlagenes Deployment',
  {
    skip: process.platform === 'win32' ? 'Die Shell-Fixture benötigt eine POSIX-Umgebung.' : false,
  },
  async () => {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), 'flipbase-deploy-'));
    const deployDirectory = join(fixtureDirectory, 'app');
    const landingDirectory = join(fixtureDirectory, 'landing');
    const binDirectory = join(fixtureDirectory, 'bin');
    const caddyConfig = join(fixtureDirectory, 'Caddyfile');
    const caddyCandidate = 'fixture-caddy-config\n';

    try {
      await Promise.all([mkdir(deployDirectory), mkdir(landingDirectory), mkdir(binDirectory)]);
      await writeFile(caddyConfig, caddyCandidate, 'utf8');
      const dockerFixture = join(binDirectory, 'docker');
      await writeFile(
        dockerFixture,
        `#!/bin/sh
case "$1" in
  login) cat >/dev/null ;;
  compose|logout|image) ;;
  inspect) echo healthy ;;
  cp)
    if [ "$2" = "flipbase-web:/opt/flipbase/Caddyfile" ]; then
      printf '%s' "$CADDY_CANDIDATE" > "$3"
    else
      exit 42
    fi
    ;;
  logs) echo container logs >&2 ;;
esac
`,
        'utf8',
      );
      await chmod(dockerFixture, 0o755);

      const result = await runDeploy({
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
        SSH_ORIGINAL_COMMAND: 'sha-1234567',
        FLIPBASE_DEPLOY_DIR: deployDirectory,
        FLIPBASE_LANDING_DIR: landingDirectory,
        FLIPBASE_CADDY_CONFIG_PATH: caddyConfig,
        CADDY_CANDIDATE: caddyCandidate,
      });

      assert.equal(result.code, 1);
      assert.match(result.stdout, /flipbase-web ist gesund\./);
      assert.doesNotMatch(result.stdout, /Landingpage synchronisiert\./);
      assert.match(result.stderr, /vorherige Caddy-Konfiguration wieder her/u);
    } finally {
      await rm(fixtureDirectory, { force: true, recursive: true });
    }
  },
);

test(
  'rollt ein separates Sniper-Abbild aus und legt dessen Profil ohne Host-Benutzer an',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'flipbase-sniper-deploy-'));
    const bin = join(root, 'bin');
    const log = join(root, 'docker.log');
    await mkdir(bin);
    try {
      const profileLog = join(root, 'profile.log');
      await writeFile(
        join(bin, 'install'),
        `#!/bin/sh
case " $* " in
  *" -o "*|*" -g "*) echo "install: invalid user: '1000'" >&2; exit 1 ;;
esac
exec /usr/bin/install "$@"
`,
        { mode: 0o755 },
      );
      await writeFile(join(bin, 'chown'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$PROFILE_LOG"\n', {
        mode: 0o755,
      });
      await writeFile(
        join(root, 'sniper.env'),
        'SUPABASE_ANON_KEY=public-fixture-key-for-authentication\n',
      );
      await writeFile(join(bin, 'stat'), '#!/bin/sh\necho "${PROFILE_OWNER:-1000:1000:700}"\n', {
        mode: 0o755,
      });
      await writeFile(
        join(bin, 'docker'),
        `#!/bin/bash
echo "$*" >> "$DOCKER_LOG"
case "$1" in
 login) cat >/dev/null ;;
 compose)
   if [[ "$2" == "-f" ]]; then
     [[ "$FLIPBASE_SNIPER_IMAGE" == "$EXPECTED_SNIPER_IMAGE" ]] || exit 90
     if [[ "$4" == config ]]; then echo "\${CONFIGURED_SNIPER_IMAGE:-$EXPECTED_SNIPER_IMAGE}"; fi
   fi
   ;;
 inspect) echo healthy ;;
 cp)
   case "$2" in
     *docker-compose.sniper.yml) printf 'services:\\n  sniper:\\n    image: fixture\\n' > "$3" ;;
     *chromium-seccomp.json) printf '{"defaultAction":"SCMP_ACT_ERRNO"}' > "$3" ;;
     *) exit 92 ;;
   esac
   ;;
 logout|image) ;;
 *) exit 91 ;;
esac
`,
        { mode: 0o755 },
      );
      const result = await runDeploy({
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        FLIPBASE_DEPLOY_DIR: root,
        FLIPBASE_LANDING_DIR: join(root, 'absent'),
        FLIPBASE_SNIPER_COMPOSE_FILE: join(root, 'docker-compose.sniper.yml'),
        SSH_ORIGINAL_COMMAND: 'web sha-1234567 sniper sha-7654321',
        DOCKER_LOG: log,
        EXPECTED_SNIPER_IMAGE: 'ghcr.io/grischatdev/flipbase-sniper:sha-7654321',
        PROFILE_LOG: profileLog,
      });

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /flipbase-web ist gesund\./);
      assert.match(result.stdout, /flipbase-sniper ist gesund\./);
      assert.equal(await readFile(profileLog, 'utf8'), `1000:1000 ${join(root, 'browser')}\n`);
      const dockerCalls = await readFile(log, 'utf8');
      assert.match(dockerCalls, /compose -f .* pull sniper/);
      assert.match(dockerCalls, /compose -f .* up -d --pull never sniper/);
      const digest = `sha256:${'b'.repeat(64)}`;
      const environment = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        FLIPBASE_DEPLOY_DIR: root,
        FLIPBASE_LANDING_DIR: join(root, 'absent'),
        FLIPBASE_SNIPER_COMPOSE_FILE: join(root, 'docker-compose.sniper.yml'),
        SSH_ORIGINAL_COMMAND: `sniper ${digest}`,
        DOCKER_LOG: log,
        EXPECTED_SNIPER_IMAGE: `ghcr.io/grischatdev/flipbase-sniper@${digest}`,
      };
      const immutable = await runDeploy(environment);
      assert.equal(immutable.code, 0, immutable.stderr);
      await writeFile(log, '');
      const stale = await runDeploy({
        ...environment,
        CONFIGURED_SNIPER_IMAGE: 'ghcr.io/grischatdev/flipbase-sniper:latest',
      });
      assert.notEqual(stale.code, 0);
      assert.doesNotMatch(await readFile(log, 'utf8'), /pull sniper|up .*sniper/);
      for (const command of [
        'sniper latest',
        `sniper sha256:${'b'.repeat(65)}`,
        `sniper ${digest} extra`,
      ])
        assert.equal((await runDeploy({ ...environment, SSH_ORIGINAL_COMMAND: command })).code, 2);
      assert.ok(
        dockerCalls.indexOf('config --quiet') < dockerCalls.indexOf('up -d --pull never sniper'),
      );
      assert.equal(
        await readFile(join(root, 'docker-compose.sniper.yml'), 'utf8'),
        'services:\n  sniper:\n    image: fixture\n',
      );
      assert.equal(
        await readFile(join(root, 'chromium-seccomp.json'), 'utf8'),
        '{"defaultAction":"SCMP_ACT_ERRNO"}',
      );
      await writeFile(join(root, 'sniper.env'), 'SUPABASE_ANON_KEY=""\n');
      await writeFile(log, '');
      const missingKey = await runDeploy({
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        FLIPBASE_DEPLOY_DIR: root,
        FLIPBASE_SNIPER_COMPOSE_FILE: join(root, 'docker-compose.sniper.yml'),
        SSH_ORIGINAL_COMMAND: 'sniper sha-7654321',
        DOCKER_LOG: log,
        EXPECTED_SNIPER_IMAGE: 'ghcr.io/grischatdev/flipbase-sniper:sha-7654321',
      });
      assert.notEqual(missingKey.code, 0);
      assert.match(missingKey.stderr, /SUPABASE_ANON_KEY fehlt/);
      assert.doesNotMatch(await readFile(log, 'utf8'), /up -d/);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  },
);
