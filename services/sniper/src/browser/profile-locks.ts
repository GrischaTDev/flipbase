import { lstat, readlink, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';

export interface ProfileLockChecks {
  isPortFree?(): Promise<boolean>;
  isProcessAlive?(pid: number): boolean;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

/** Nur bei exklusivem Containerbetrieb desselben Profils beim Start aufrufen. */
export async function removeOrphanedProfileLocks(
  profileDir: string,
  port: number,
  checks: ProfileLockChecks = {},
): Promise<void> {
  const lock = await lstat(join(profileDir, 'SingletonLock')).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    },
  );
  const portFree = () => (checks.isPortFree ?? (() => isPortFree(port)))();
  if (!lock) {
    if (!(await portFree())) throw new Error('Browserport ist bereits belegt.');
    return;
  }
  if (!lock.isSymbolicLink()) throw new Error('Browserprofil ist bereits belegt.');
  const uid = process.getuid?.();
  const profile = await lstat(profileDir);
  if (
    uid === undefined ||
    !profile.isDirectory() ||
    profile.isSymbolicLink() ||
    profile.uid !== uid
  )
    throw new Error('Browserprofil gehört keinem bestätigten Benutzer.');
  const links: { path: string; inode: number; device: number; target: string }[] = [];
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const path = join(profileDir, name);
    const entry = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (!entry) continue;
    if (!entry.isSymbolicLink() || entry.uid !== uid)
      throw new Error('Browserprofil ist bereits belegt.');
    links.push({ path, inode: entry.ino, device: entry.dev, target: await readlink(path) });
  }
  const owner = links.find((link) => link.path === join(profileDir, 'SingletonLock'));
  const match = owner?.target.match(/^[a-zA-Z0-9][a-zA-Z0-9._-]*-([1-9][0-9]*)$/);
  const pid = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(pid) || pid <= 0 || (checks.isProcessAlive ?? isProcessAlive)(pid))
    throw new Error('Browserprofil ist bereits belegt.');
  if (!(await portFree())) throw new Error('Browserport ist bereits belegt.');
  // Zwischen Prüfung und Entfernen gewechselte Einträge gehören nicht zu dieser Bereinigung.
  for (const link of links) {
    const current = await lstat(link.path);
    if (
      !current.isSymbolicLink() ||
      current.uid !== uid ||
      current.ino !== link.inode ||
      current.dev !== link.device ||
      (await readlink(link.path)) !== link.target
    )
      throw new Error('Browsersperre wurde während der Prüfung geändert.');
  }
  for (const link of links) await unlink(link.path);
}
