import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const image = process.argv[2];
if (!image) throw new Error('Image required');
const name = `push-smoke-${process.pid}`;
try {
  execFileSync(
    'docker',
    [
      'run',
      '-d',
      '--name',
      name,
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges:true',
      '-e',
      'WEB_PUSH_ENABLED=false',
      '-p',
      '127.0.0.1::4177',
      image,
    ],
    { stdio: 'pipe' },
  );
  const port = execFileSync('docker', ['port', name, '4177/tcp'], { encoding: 'utf8' })
    .trim()
    .split(':')
    .pop();
  let health;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) {
        health = await response.json();
        break;
      }
    } catch {
      /* Prozessstart abwarten. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(health?.healthy, true);
  assert.equal(health.enabled, false);
  const revision = execFileSync(
    'docker',
    ['inspect', '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}', name],
    { encoding: 'utf8' },
  ).trim();
  assert.equal(health.commit, revision);
  console.log('Push image healthy; sending disabled.');
} finally {
  execFileSync('docker', ['rm', '-f', name], { stdio: 'pipe' });
}
