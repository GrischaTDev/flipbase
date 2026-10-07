import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const deployScript = fileURLToPath(new URL('../deploy/deploy.sh', import.meta.url));
const dockerfile = fileURLToPath(new URL('../docker/Dockerfile', import.meta.url));

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

test('Docker-Kontext enthält alle von Angular verwendeten gemeinsamen Verträge', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const rules = (await readFile(join(root, '.dockerignore'), 'utf8')).split(/\r?\n/u);
  const sharedPrefix = 'supabase/functions/_shared/';
  const resolveContractFile = (directory, modulePath) => {
    const contractPath = posix.join(directory, modulePath);
    if (contractPath.endsWith('.ts')) return contractPath;
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
  const caddyActivation = deploySource.lastIndexOf('activate_release_caddy_configuration');
  const landingCopy = deploySource.indexOf(
    'docker cp flipbase-web:/usr/share/nginx/landing/. "$LANDING_DIRECTORY"/',
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
 cp|rm|logout|image) ;;
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
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FLIPBASE_DEPLOY_DIR: root,
        FLIPBASE_LANDING_DIR: join(root, 'absent'),
        SSH_ORIGINAL_COMMAND: `release-v1 ${digest}`,
        EXPECTED_IMAGE: image,
      };
      const success = await runDeploy(env);
      assert.equal(success.code, 0, success.stderr);
      assert.match(success.stdout, /start/);
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
