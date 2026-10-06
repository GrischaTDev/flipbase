import { randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { isAbsolute, join, parse, resolve } from 'node:path';
import { CloudBrowserStopUncertainError } from './gologin-cloud-browser.ts';

interface ChromiumProfileStoreOptions {
  root: string;
  inspectProfileProcesses?: (directory: string) => Promise<number[]>;
}

interface ProfileOwner {
  ownerId: string;
  workerPid: number;
  workerIdentity?: string;
  profileId: string;
}

export interface ChromiumProfileLease {
  directory: string;
  confirmStopped(): Promise<void>;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ESRCH')) return false;
    throw new CloudBrowserStopUncertainError();
  }
}

async function processIdentity(pid: number): Promise<string | undefined> {
  if (process.platform !== 'linux') return undefined;
  const [bootId, processStat] = await Promise.all([
    readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
    readFile(`/proc/${pid}/stat`, 'utf8'),
  ]);
  const startTicks = processStat.slice(processStat.lastIndexOf(')') + 2).split(' ')[19];
  if (!startTicks || !/^\d+$/.test(startTicks) || !bootId.trim()) {
    throw new CloudBrowserStopUncertainError();
  }
  return `${bootId.trim()}:${startTicks}`;
}

async function isOwnerAlive(owner: ProfileOwner): Promise<boolean> {
  if (!isProcessAlive(owner.workerPid)) return false;
  if (!owner.workerIdentity) return true;
  try {
    const identity = await processIdentity(owner.workerPid);
    // Dieselbe PID kann nach einem Container-Neustart einem anderen Prozess gehören.
    return identity === undefined || identity === owner.workerIdentity;
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ESRCH')) return false;
    throw new CloudBrowserStopUncertainError();
  }
}

// Ohne lesbare Prozessliste lässt sich ein Profil nach einem Abbruch nicht sicher freigeben.
export async function inspectChromiumProfileProcesses(directory: string): Promise<number[]> {
  if (process.platform !== 'linux') throw new CloudBrowserStopUncertainError();
  const processes = new Map<number, { parentPid: number; usesProfile: boolean }>();
  for (const entry of await readdir('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const [commandLine, status] = await Promise.all([
        readFile(`/proc/${entry}/cmdline`, 'utf8'),
        readFile(`/proc/${entry}/status`, 'utf8'),
      ]);
      const argumentsList = commandLine.split('\0');
      const usesProfile = argumentsList.some(
        (argument, index) =>
          argument === `--user-data-dir=${directory}` ||
          (argument === '--user-data-dir' && argumentsList[index + 1] === directory),
      );
      const parentPid = Number(status.match(/^PPid:\s+(\d+)/m)?.[1]);
      if (!Number.isSafeInteger(parentPid)) throw new CloudBrowserStopUncertainError();
      processes.set(Number(entry), { parentPid, usesProfile });
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ESRCH')) continue;
      throw new CloudBrowserStopUncertainError();
    }
  }
  const matching = new Set(
    [...processes].filter(([, entry]) => entry.usesProfile).map(([pid]) => pid),
  );
  let previousSize = -1;
  while (matching.size !== previousSize) {
    previousSize = matching.size;
    for (const [pid, entry] of processes) {
      if (matching.has(entry.parentPid)) matching.add(pid);
    }
  }
  return [...matching];
}

export class ChromiumProfileStore {
  private readonly root: string;
  private readonly inspect: (directory: string) => Promise<number[]>;

  constructor(options: ChromiumProfileStoreOptions) {
    if (!isAbsolute(options.root) || resolve(options.root) === parse(resolve(options.root)).root) {
      throw new Error('Absoluter geschützter Chromium-Profilpfad fehlt');
    }
    this.root = resolve(options.root);
    this.inspect = options.inspectProfileProcesses ?? inspectChromiumProfileProcesses;
  }

  private validateProfileId(profileId: string): void {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(profileId) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(profileId)
    ) {
      throw new Error('Ungültige Chromium-Profil-ID');
    }
  }

  directory(profileId: string): string {
    this.validateProfileId(profileId);
    return join(this.root, profileId);
  }

  private async assertPrivateDirectory(directory: string, create = false): Promise<void> {
    if (create) await mkdir(directory, { recursive: directory === this.root, mode: 0o700 });
    const status = await lstat(directory);
    if (
      !status.isDirectory() ||
      status.isSymbolicLink() ||
      (await realpath(directory)) !== directory
    ) {
      throw new Error('Unsicherer Chromium-Profilpfad');
    }
    if (process.platform !== 'win32') {
      if (status.uid !== process.getuid?.())
        throw new Error('Chromium-Profil gehört einem anderen Nutzer');
      await chmod(directory, 0o700);
    }
  }

  private async prepare(profileId: string): Promise<{ directory: string; lockDirectory: string }> {
    this.validateProfileId(profileId);
    await this.assertPrivateDirectory(this.root, true);
    const directory = this.directory(profileId);
    try {
      await this.assertPrivateDirectory(directory, true);
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) throw error;
      await this.assertPrivateDirectory(directory);
    }
    return { directory, lockDirectory: join(this.root, `${profileId}.running`) };
  }

  private async assertStopped(directory: string): Promise<void> {
    try {
      if ((await this.inspect(directory)).length !== 0) throw new CloudBrowserStopUncertainError();
    } catch {
      throw new CloudBrowserStopUncertainError();
    }
  }

  private async removeStoppedSingletonLinks(directory: string): Promise<void> {
    try {
      await this.assertPrivateDirectory(directory);
      const linkedMarkers: string[] = [];
      for (const marker of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
        const markerPath = join(directory, marker);
        try {
          const status = await lstat(markerPath);
          if (!status.isSymbolicLink()) throw new CloudBrowserStopUncertainError();
          linkedMarkers.push(markerPath);
        } catch (error) {
          if (!hasErrorCode(error, 'ENOENT')) throw error;
        }
      }
      // Erst alle Marker prüfen; unlink entfernt nur den Link, niemals sein Ziel.
      for (const markerPath of linkedMarkers) await unlink(markerPath);
    } catch {
      throw new CloudBrowserStopUncertainError();
    }
  }

  private async readOwner(lockDirectory: string): Promise<ProfileOwner> {
    await this.assertPrivateDirectory(lockDirectory);
    const ownerPath = join(lockDirectory, 'owner.json');
    const status = await lstat(ownerPath);
    if (!status.isFile() || status.isSymbolicLink()) throw new CloudBrowserStopUncertainError();
    const owner: unknown = JSON.parse(await readFile(ownerPath, 'utf8'));
    if (
      typeof owner !== 'object' ||
      owner === null ||
      !('ownerId' in owner) ||
      typeof owner.ownerId !== 'string' ||
      !('workerPid' in owner) ||
      typeof owner.workerPid !== 'number' ||
      !Number.isSafeInteger(owner.workerPid) ||
      owner.workerPid <= 0 ||
      !('profileId' in owner) ||
      typeof owner.profileId !== 'string'
    ) {
      throw new CloudBrowserStopUncertainError();
    }
    if (
      'workerIdentity' in owner &&
      (typeof owner.workerIdentity !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:\d+$/.test(
          owner.workerIdentity,
        ))
    ) {
      throw new CloudBrowserStopUncertainError();
    }
    return {
      ownerId: owner.ownerId,
      workerPid: owner.workerPid,
      profileId: owner.profileId,
      workerIdentity:
        'workerIdentity' in owner && typeof owner.workerIdentity === 'string'
          ? owner.workerIdentity
          : undefined,
    };
  }

  private async removeOwnedLock(lockDirectory: string, ownerId: string): Promise<void> {
    const owner = await this.readOwner(lockDirectory);
    if (
      owner.ownerId !== ownerId ||
      (await readdir(lockDirectory)).some((name) => name !== 'owner.json')
    ) {
      throw new CloudBrowserStopUncertainError();
    }
    await unlink(join(lockDirectory, 'owner.json'));
    await rmdir(lockDirectory);
  }

  async acquire(profileId: string): Promise<ChromiumProfileLease> {
    const { directory, lockDirectory } = await this.prepare(profileId);
    const workerIdentity = await processIdentity(process.pid);
    try {
      await mkdir(lockDirectory, { mode: 0o700 });
    } catch (error) {
      if (hasErrorCode(error, 'EEXIST'))
        throw new Error('Chromium-Profil ist gesperrt', { cause: error });
      throw error;
    }
    const ownerId = randomUUID();
    await writeFile(
      join(lockDirectory, 'owner.json'),
      JSON.stringify({
        ownerId,
        workerPid: process.pid,
        workerIdentity,
        profileId,
      }),
      { mode: 0o600, flag: 'wx' },
    );
    // Auch ohne Marker können nach einem unvollständigen früheren Start Prozesse übrig sein.
    await this.assertStopped(directory);
    await this.removeStoppedSingletonLinks(directory);
    let released = false;
    return {
      directory,
      confirmStopped: async () => {
        if (released) return;
        await this.assertPrivateDirectory(directory);
        await this.assertStopped(directory);
        await this.removeOwnedLock(lockDirectory, ownerId);
        released = true;
      },
    };
  }

  // Der Broker besitzt die echten Profilverzeichnisse exklusiv. Worker-Sperren
  // bleiben im getrennten Metadatenverzeichnis und behalten die Worker-PID.
  async prepareStopped(profileId: string): Promise<string> {
    const { directory } = await this.prepare(profileId);
    await this.assertStopped(directory);
    await this.removeStoppedSingletonLinks(directory);
    return directory;
  }

  async recoverStopped(profileId: string): Promise<void> {
    const { directory, lockDirectory } = await this.prepare(profileId);
    try {
      await lstat(lockDirectory);
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) {
        await this.assertStopped(directory);
        return;
      }
      throw new CloudBrowserStopUncertainError();
    }
    const recoveryDirectory = join(this.root, `${profileId}.recovery`);
    try {
      await mkdir(recoveryDirectory, { mode: 0o700 });
    } catch {
      throw new CloudBrowserStopUncertainError();
    }
    try {
      const owner = await this.readOwner(lockDirectory);
      if (owner.profileId !== profileId || (await isOwnerAlive(owner))) {
        throw new CloudBrowserStopUncertainError();
      }
      await this.assertStopped(directory);
      await this.removeOwnedLock(lockDirectory, owner.ownerId);
    } catch {
      throw new CloudBrowserStopUncertainError();
    } finally {
      await rmdir(recoveryDirectory);
    }
  }
}
