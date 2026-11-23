import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';

/** So lange bleiben Tagesprotokolle erhalten; danach entscheidet der Server-Speicher. */
const retentionDays = 14;
/** Obergrenze aller Tagesprotokolle zusammen; die ältesten Dateien weichen zuerst. */
const maxTotalBytes = 200 * 1024 * 1024;
const fileName = /^worker-(\d{4}-\d{2}-\d{2})\.log$/;

interface WorkerLogArchiveOptions {
  directory: string;
  now?: () => Date;
  retentionDays?: number;
  maxTotalBytes?: number;
}

type WriteFunction = typeof process.stdout.write;

/**
 * Schreibt alles, was der Worker auf stdout und stderr ausgibt, zusätzlich in Tagesdateien im
 * dauerhaften Datenordner. Das Containerprotokoll verschwindet bei jedem Update mit dem alten
 * Container; diese Kopie bleibt erhalten. Die Ausgaben enthalten nur feste Ereignisse ohne
 * Anbieterantworten oder Zugangsdaten. Jeder Dateifehler schaltet die Kopie still ab, damit das
 * Protokollieren nie den Worker stört. Geschrieben wird synchron, damit auch die letzten Zeilen
 * vor einem `process.exit` ankommen.
 */
export function installWorkerLogArchive(options: WorkerLogArchiveOptions): () => void {
  const now = options.now ?? (() => new Date());
  const keepDays = options.retentionDays ?? retentionDays;
  const keepBytes = options.maxTotalBytes ?? maxTotalBytes;
  let fd: number | null = null;
  let day = '';
  let disabled = false;

  const prune = () => {
    const cutoff = new Date(now().getTime() - keepDays * 86_400_000).toISOString().slice(0, 10);
    const files = readdirSync(options.directory)
      .map((name) => ({ name, day: fileName.exec(name)?.[1] }))
      .filter((entry): entry is { name: string; day: string } => !!entry.day)
      .sort((left, right) => left.day.localeCompare(right.day));
    let total = 0;
    const sized = files.map((entry) => {
      const size = statSync(join(options.directory, entry.name)).size;
      total += size;
      return { ...entry, size };
    });
    for (const entry of sized) {
      if (entry.day === day) break;
      if (entry.day >= cutoff && total <= keepBytes) break;
      unlinkSync(join(options.directory, entry.name));
      total -= entry.size;
    }
  };

  const target = () => {
    const today = now().toISOString().slice(0, 10);
    if (fd !== null && today === day) return fd;
    if (fd !== null) closeSync(fd);
    fd = null;
    day = today;
    mkdirSync(options.directory, { recursive: true, mode: 0o700 });
    fd = openSync(join(options.directory, `worker-${today}.log`), 'a', 0o600);
    prune();
    return fd;
  };

  const record = (stream: 'out' | 'err', chunk: unknown) => {
    if (disabled) return;
    try {
      const text =
        typeof chunk === 'string'
          ? chunk
          : chunk instanceof Uint8Array
            ? Buffer.from(chunk).toString('utf8')
            : '';
      if (!text) return;
      const stamp = now().toISOString();
      const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
      writeSync(target(), lines.map((line) => `${stamp} ${stream} ${line}\n`).join(''));
    } catch {
      disabled = true;
      if (fd !== null) {
        try {
          closeSync(fd);
        } catch {
          // Bereits geschlossen; nichts weiter zu tun.
        }
        fd = null;
      }
    }
  };

  const wrap = (stream: NodeJS.WriteStream, name: 'out' | 'err'): WriteFunction => {
    const original = stream.write.bind(stream) as WriteFunction;
    stream.write = ((chunk: unknown, ...rest: unknown[]) => {
      record(name, chunk);
      return (original as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as WriteFunction;
    return original;
  };
  const stdout = wrap(process.stdout, 'out');
  const stderr = wrap(process.stderr, 'err');
  return () => {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
    disabled = true;
    if (fd !== null) closeSync(fd);
    fd = null;
  };
}
