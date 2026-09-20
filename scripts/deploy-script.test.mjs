import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const deployScript = fileURLToPath(new URL('../deploy/deploy.sh', import.meta.url));
const dockerfile = fileURLToPath(new URL('../docker/Dockerfile', import.meta.url));

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
  'rollt ein separates Sniper-Abbild aus und wartet auf dessen Healthcheck',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'flipbase-sniper-deploy-'));
    const bin = join(root, 'bin');
    const log = join(root, 'docker.log');
    await mkdir(bin);
    try {
      await writeFile(
        join(bin, 'docker'),
        `#!/bin/bash
echo "$*" >> "$DOCKER_LOG"
case "$1" in
 login) cat >/dev/null ;;
 compose)
   if [[ "$2" == "-f" ]]; then
     [[ "$FLIPBASE_SNIPER_IMAGE" == "$EXPECTED_SNIPER_IMAGE" ]] || exit 90
   fi
   ;;
 inspect) echo healthy ;;
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
      });

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /flipbase-web ist gesund\./);
      assert.match(result.stdout, /flipbase-sniper ist gesund\./);
      const dockerCalls = await readFile(log, 'utf8');
      assert.match(dockerCalls, /compose -f .* pull sniper/);
      assert.match(dockerCalls, /compose -f .* up -d --pull never sniper/);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  },
);
