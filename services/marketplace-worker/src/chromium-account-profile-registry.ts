import { constants } from 'node:fs';
import { chmod, link, lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';

export const chromiumAccountProfileIdPattern =
  /^chromium_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const bindingPattern = /^[a-zA-Z0-9_-]{1,128}$/;

export interface ChromiumAccountProfile {
  profileId: string;
  workspaceId: string;
  connectionId: string;
  hostId: string;
  networkId: string;
  previousGoLoginProfileId?: string;
}

interface RegistryOptions {
  root: string;
  hostId: string;
  networkId?: string;
}
interface NewAccountProfile {
  workspaceId: string;
  connectionId: string;
  previousGoLoginProfileId?: string;
}

function error(): Error {
  return new Error('Private Browserprofilzuordnung konnte nicht bestätigt werden');
}
function missing(failure: unknown): boolean {
  return (
    typeof failure === 'object' &&
    failure !== null &&
    'code' in failure &&
    failure.code === 'ENOENT'
  );
}

/** Die Anbieterreferenz bleibt unveränderlich; ein verlorenes Manifest ist kein neues Profil. */
export class ChromiumAccountProfileRegistry {
  private readonly root: string;
  private readonly hostId: string;
  private readonly networkId: string;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(options: RegistryOptions) {
    if (
      !isAbsolute(options.root) ||
      resolve(options.root) === parse(resolve(options.root)).root ||
      !bindingPattern.test(options.hostId) ||
      !bindingPattern.test(options.networkId ?? 'direct')
    )
      throw error();
    this.root = resolve(options.root);
    this.hostId = options.hostId;
    this.networkId = options.networkId ?? 'direct';
  }

  create(account: NewAccountProfile): Promise<ChromiumAccountProfile> {
    const operation = this.pending.then(async () => {
      if (
        !bindingPattern.test(account.workspaceId) ||
        !bindingPattern.test(account.connectionId) ||
        (account.previousGoLoginProfileId !== undefined &&
          (!bindingPattern.test(account.previousGoLoginProfileId) ||
            account.previousGoLoginProfileId.startsWith('chromium_')))
      )
        throw error();
      const directory = join(this.root, 'registry');
      await this.privateDirectory(directory);
      for (const filename of await readdir(directory)) {
        if (!filename.endsWith('.json')) continue;
        const existing = await this.resolve(filename.slice(0, -5));
        if (
          existing.workspaceId === account.workspaceId &&
          existing.connectionId === account.connectionId
        )
          throw new Error('Browserprofilzuordnung besteht bereits');
      }
      const profile: ChromiumAccountProfile = {
        profileId: `chromium_${randomUUID()}`,
        workspaceId: account.workspaceId,
        connectionId: account.connectionId,
        hostId: this.hostId,
        networkId: this.networkId,
        ...(account.previousGoLoginProfileId
          ? { previousGoLoginProfileId: account.previousGoLoginProfileId }
          : {}),
      };
      const destination = join(directory, `${profile.profileId}.json`);
      const temporary = join(directory, `.${randomUUID()}.tmp`);
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(profile));
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await link(temporary, destination);
      } finally {
        await unlink(temporary);
      }
      return Object.freeze(profile);
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }

  async resolve(profileId: string): Promise<ChromiumAccountProfile> {
    if (!chromiumAccountProfileIdPattern.test(profileId)) throw error();
    const path = join(this.root, 'registry', `${profileId}.json`);
    await this.assertSafePath(path);
    const status = await lstat(path);
    if (
      !status.isFile() ||
      status.size > 16_384 ||
      (process.platform !== 'win32' &&
        ((status.mode & 0o077) !== 0 || status.uid !== process.getuid?.()))
    )
      throw error();
    const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let profile: unknown;
    try {
      profile = JSON.parse(await handle.readFile('utf8'));
    } finally {
      await handle.close();
    }
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw error();
    const fields = profile as Record<string, unknown>;
    const allowed = [
      'profileId',
      'workspaceId',
      'connectionId',
      'hostId',
      'networkId',
      'previousGoLoginProfileId',
    ];
    if (
      Object.keys(fields).some((name) => !allowed.includes(name)) ||
      fields['profileId'] !== profileId ||
      fields['hostId'] !== this.hostId ||
      !['workspaceId', 'connectionId', 'hostId', 'networkId'].every(
        (name) => typeof fields[name] === 'string' && bindingPattern.test(fields[name]),
      ) ||
      (fields['previousGoLoginProfileId'] !== undefined &&
        (typeof fields['previousGoLoginProfileId'] !== 'string' ||
          !bindingPattern.test(fields['previousGoLoginProfileId']) ||
          fields['previousGoLoginProfileId'].startsWith('chromium_')))
    )
      throw error();
    return Object.freeze(fields as unknown as ChromiumAccountProfile);
  }

  async find(workspaceId: string, connectionId: string): Promise<ChromiumAccountProfile | null> {
    if (!bindingPattern.test(workspaceId) || !bindingPattern.test(connectionId)) throw error();
    const directory = join(this.root, 'registry');
    await this.assertSafePath(directory, true);
    let filenames: string[];
    try {
      filenames = await readdir(directory);
    } catch (failure) {
      if (missing(failure)) return null;
      throw failure;
    }
    let found: ChromiumAccountProfile | null = null;
    for (const filename of filenames) {
      if (!filename.endsWith('.json')) continue;
      const candidate = await this.resolve(filename.slice(0, -5));
      if (candidate.workspaceId !== workspaceId || candidate.connectionId !== connectionId)
        continue;
      if (found) throw error();
      found = candidate;
    }
    return found;
  }

  /** Nur nach bestätigtem Prozessstopp und bestätigter Verbindungslöschung aufrufen. */
  async archive(profileId: string): Promise<void> {
    await this.resolve(profileId);
    for (const suffix of ['running', 'recovery']) {
      try {
        await lstat(join(this.root, 'profiles', `${profileId}.${suffix}`));
        throw error();
      } catch (failure) {
        if (!missing(failure)) throw failure;
      }
    }
    const archive = join(this.root, 'archive');
    await this.privateDirectory(archive);
    const profileDirectory = join(this.root, 'profiles', profileId);
    try {
      await this.assertSafePath(profileDirectory);
      if (!(await lstat(profileDirectory)).isDirectory()) throw error();
      await rename(profileDirectory, join(archive, profileId));
    } catch (failure) {
      if (!missing(failure)) throw failure;
    }
    await rename(
      join(this.root, 'registry', `${profileId}.json`),
      join(archive, `${profileId}.json`),
    );
  }

  private async privateDirectory(directory: string): Promise<void> {
    await this.assertSafePath(directory, true);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await this.assertSafePath(directory);
    await chmod(this.root, 0o700);
    await chmod(directory, 0o700);
  }

  private async assertSafePath(path: string, allowMissing = false): Promise<void> {
    let current = resolve(path);
    while (true) {
      try {
        if ((await lstat(current)).isSymbolicLink()) throw error();
      } catch (failure) {
        if (!(allowMissing && missing(failure))) throw failure;
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    const rootStatus = await lstat(this.root).catch((failure: unknown) => {
      if (allowMissing && missing(failure)) return undefined;
      throw failure;
    });
    if (
      rootStatus &&
      (!rootStatus.isDirectory() ||
        (process.platform !== 'win32' &&
          ((rootStatus.mode & 0o077) !== 0 || rootStatus.uid !== process.getuid?.())))
    )
      throw error();
  }
}
