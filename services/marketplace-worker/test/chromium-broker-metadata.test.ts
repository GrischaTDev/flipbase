import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error Host-Werkzeug ohne zusätzliche Anwendungstypen.
import { prepareChromiumBroker } from '../../../deploy/prepare-chromium-broker.mjs';

test('Umstellung kopiert nur Zuordnungen und Worker-Sperren, niemals echte Browserdaten', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chromium-broker-metadata-'));
  const source = join(root, 'actual');
  const target = join(root, 'metadata');
  const profileId = 'chromium_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  try {
    await mkdir(join(source, 'profiles', profileId), { recursive: true });
    await mkdir(join(source, 'registry'));
    await mkdir(join(source, 'profiles', `${profileId}.running`));
    await writeFile(join(source, 'registry', `${profileId}.json`), JSON.stringify({ profileId }));
    await writeFile(join(source, 'profiles', profileId, 'Cookies'), 'private-browser-data');
    await writeFile(
      join(source, 'profiles', `${profileId}.running`, 'owner.json'),
      '{"workerPid":9876}',
    );
    await prepareChromiumBroker({
      source,
      target,
      tokenPath: join(root, 'token'),
      ownerId: process.getuid?.() ?? 1000,
    });
    assert.deepEqual(await readdir(join(target, 'profiles', profileId)), []);
    assert.equal(
      await readFile(join(source, 'profiles', profileId, 'Cookies'), 'utf8'),
      'private-browser-data',
    );
    assert.equal(
      JSON.parse(
        await readFile(join(target, 'profiles', `${profileId}.running`, 'owner.json'), 'utf8'),
      ).workerPid,
      9876,
    );
    assert.match(await readFile(join(root, 'token'), 'utf8'), /^[a-f0-9]{64}$/);
    await assert.rejects(prepareChromiumBroker({ source, target, tokenPath: join(root, 'token') }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
