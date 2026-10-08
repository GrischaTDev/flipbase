import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { DockerSessionChannel } from '../src/docker-session-channel.ts';

function channel(source: string) {
  const spawnFixture = ((_command: string, arguments_: string[]) => {
    assert.deepEqual(arguments_, [
      '--host=unix:///var/run/docker.sock',
      'exec',
      '-i',
      'a'.repeat(64),
      'node',
      '--experimental-strip-types',
      '/app/runtime/session-channel.ts',
    ]);
    return spawn(process.execPath, ['-e', source], { stdio: 'pipe' });
  }) as typeof spawn;
  return new DockerSessionChannel('a'.repeat(64), spawnFixture);
}

test('session channel preserves fragmented UTF-8 and reuses one child for consecutive requests', async () => {
  const transport = channel(
    String.raw`process.stdin.on('data', () => {const frame=Buffer.from(JSON.stringify({text:'Grüße'})+'\n');process.stdout.write(frame.subarray(0,12));setTimeout(()=>process.stdout.write(frame.subarray(12)),10);});`,
  );
  try {
    assert.deepEqual(await transport.request({ action: 'ready' }), { text: 'Grüße' });
    assert.deepEqual(await transport.request({ action: 'ready' }), { text: 'Grüße' });
  } finally {
    transport.close();
  }
});

test('session channel rejects unsolicited extra frames and cannot reopen a stopped channel', async () => {
  const transport = channel(
    String.raw`process.stdin.once('data', () => process.stdout.write('{}\n{}\n'));`,
  );
  await assert.rejects(transport.request({ action: 'ready' }), /beendet/);
  await assert.rejects(transport.request({ action: 'ready' }), /verfügbar/);
});

test('child exit rejects the pending browser command without exposing stderr', async () => {
  const transport = channel(
    `process.stdin.once('data', () => {process.stderr.write('private-fixture-key');process.exit(1);});`,
  );
  await assert.rejects(
    transport.request({ action: 'ready' }),
    (error: unknown) => error instanceof Error && error.message === 'Sitzungskanal beendet',
  );
});
