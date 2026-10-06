import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  chown,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const profilePattern = /^chromium_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
async function status(path) {
  return lstat(path).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
}
async function safePath(path) {
  for (let current = resolve(path); ; current = dirname(current)) {
    if ((await status(current))?.isSymbolicLink())
      throw new Error('Symlink im privaten Profilpfad');
    if (current === dirname(current)) break;
  }
}
export async function prepareChromiumBroker({ source, target, tokenPath, ownerId = 1000 }) {
  for (const path of [source, target, tokenPath]) await safePath(path);
  if (resolve(source) === resolve(target) || resolve(target).startsWith(resolve(source) + '/'))
    throw new Error('Metadaten müssen getrennt liegen');
  // Ein vorhandenes Ziel wird nicht zusammengeführt: erst prüfen, ob eine frühere Umstellung fertig ist.
  if (await status(target)) throw new Error('Metadatenziel besteht bereits');
  const directory = async (path) => {
    await safePath(path);
    await mkdir(path, { mode: 0o700 });
    await chmod(path, 0o700);
    if (process.platform !== 'win32') await chown(path, ownerId, ownerId);
  };
  const copyMetadata = async (input, output) => {
    await safePath(input);
    const sourceStatus = await lstat(input);
    if (!sourceStatus.isFile() || sourceStatus.size > 65536)
      throw new Error('Ungültige Profilmetadaten');
    JSON.parse(await readFile(input, 'utf8'));
    await copyFile(input, output, 1);
    await chmod(output, 0o600);
    if (process.platform !== 'win32') await chown(output, ownerId, ownerId);
  };
  await directory(target);
  for (const child of ['registry', 'profiles', 'archive']) await directory(join(target, child));
  const networkFile = join(source, 'cloud-networks.json');
  if (await status(networkFile))
    await copyMetadata(networkFile, join(target, 'cloud-networks.json'));
  for (const child of ['registry', 'archive']) {
    const inputDirectory = join(source, child);
    if (!(await status(inputDirectory))) continue;
    await safePath(inputDirectory);
    for (const filename of await readdir(inputDirectory)) {
      if (!filename.endsWith('.json')) continue;
      const profileId = filename.slice(0, -5);
      if (!profilePattern.test(profileId)) throw new Error('Ungültige Profilkennung');
      await copyMetadata(join(inputDirectory, filename), join(target, child, filename));
      await directory(join(target, child === 'registry' ? 'profiles' : 'archive', profileId));
    }
  }
  const profilesRoot = join(source, 'profiles');
  if (await status(profilesRoot)) {
    await safePath(profilesRoot);
    for (const filename of await readdir(profilesRoot)) {
      const match = /^(.*)\.(running|recovery)$/.exec(filename);
      if (!match) continue;
      if (!profilePattern.test(match[1])) throw new Error('Ungültige Profilsperre');
      const input = join(profilesRoot, filename);
      await safePath(input);
      const entries = await readdir(input);
      if (match[2] === 'running' && (entries.length !== 1 || entries[0] !== 'owner.json'))
        throw new Error('Ungültige Worker-Sperre');
      if (match[2] === 'recovery') throw new Error('Offene Profil-Recovery vor Umstellung klären');
      const output = join(target, 'profiles', filename);
      await directory(output);
      await copyMetadata(join(input, 'owner.json'), join(output, 'owner.json'));
    }
  }
  const tokenStatus = await status(tokenPath);
  if (tokenStatus) {
    if (!tokenStatus.isFile() || !/^[a-f0-9]{64}$/.test((await readFile(tokenPath, 'utf8')).trim()))
      throw new Error('Ungültiger Broker-Schlüssel');
  } else await writeFile(tokenPath, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o400 });
  await chmod(tokenPath, 0o400);
  if (process.platform !== 'win32') await chown(tokenPath, ownerId, ownerId);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.getuid?.() !== 0) throw new Error('Host-Vorbereitung benötigt root');
  const execute = (argumentsList) =>
    execFileSync('docker', ['--host=unix:///var/run/docker.sock', ...argumentsList], {
      encoding: 'utf8',
    }).trim();
  if (
    execute(['ps', '--quiet', '--filter', 'name=^/flipbase-marketplace-worker$']) ||
    execute(['ps', '--quiet', '--filter', 'label=de.flipbase.chromium.role=session'])
  )
    throw new Error('Worker und Browser müssen vor der Umstellung bestätigt beendet sein');
  await prepareChromiumBroker({
    source: '/opt/flipbase-marketplace/chromium',
    target: '/opt/flipbase-marketplace/chromium-worker',
    tokenPath: '/opt/flipbase-marketplace/chromium-broker-token',
  });
  process.stdout.write(
    'Getrennte Chromium-Metadaten vorbereitet; Browserdaten unverändert erhalten.\n',
  );
}
