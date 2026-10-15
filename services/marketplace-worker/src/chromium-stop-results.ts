import { chmod, lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';

export interface ChromiumStopResultStore {
  read(profileId: string): Promise<boolean>;
  write(profileId: string): Promise<void>;
  clear(profileId: string): Promise<void>;
}

/** Nur feste Stoppmetadaten außerhalb der in Browsersitzungen eingebundenen Profile. */
export class ChromiumStopResults implements ChromiumStopResultStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private async path(profileId: string): Promise<string> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(profileId))
      throw new Error('Ungültiges Stoppprofil');
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const status = await lstat(this.root);
    if (
      !status.isDirectory() ||
      status.isSymbolicLink() ||
      (await realpath(this.root)) !== this.root ||
      (process.platform !== 'win32' && status.uid !== process.getuid?.())
    )
      throw new Error('Unsicheres Stoppverzeichnis');
    await chmod(this.root, 0o700);
    return join(this.root, `${profileId}.stop`);
  }
  async read(profileId: string): Promise<boolean> {
    const path = await this.path(profileId);
    try {
      const status = await lstat(path);
      if (
        !status.isFile() ||
        status.isSymbolicLink() ||
        status.size !== 11 ||
        (process.platform !== 'win32' &&
          (status.uid !== process.getuid?.() || (status.mode & 0o077) !== 0)) ||
        (await readFile(path, 'utf8')) !== 'unclean-v1\n'
      )
        throw new Error('Ungültiger Stoppnachweis');
      return true;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
      throw error;
    }
  }
  async write(profileId: string): Promise<void> {
    const path = await this.path(profileId);
    if (await this.read(profileId)) return;
    const pending = `${path}.${randomUUID()}.pending`;
    const file = await open(pending, 'wx', 0o600);
    try {
      await file.writeFile('unclean-v1\n');
      await file.sync();
    } finally {
      await file.close();
    }
    // Ein Abbruch vor rename hinterlässt ausschließlich eine private temporäre
    // Datei. Der sichtbare Stoppnachweis ist immer vollständig geschrieben.
    await rename(pending, path);
  }
  async clear(profileId: string): Promise<void> {
    if (await this.read(profileId)) await unlink(await this.path(profileId));
  }
}
