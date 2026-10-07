import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { chmod, lstat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sleep } from '../vinted/session.js';

export interface ChromeProcessOptions {
  profileDir: string;
  cdpPort: number;
}

interface ChromeDependencies {
  spawn?: (file: string, args: string[], options: SpawnOptions) => ChildProcess;
  execute?: (args: string[], input?: string) => Promise<Buffer>;
  isCdpReady?: () => Promise<boolean>;
}

export class ChromeProcess {
  private readonly children: ChildProcess[] = [];
  private pending: Promise<void> | undefined;
  private ready = false;
  private failed = false;
  private stopping = false;
  private readonly environment: NodeJS.ProcessEnv = { ...process.env, DISPLAY: ':99' };

  constructor(
    readonly options: ChromeProcessOptions,
    private readonly deps: ChromeDependencies = {},
  ) {}

  get endpoint(): string {
    return `http://127.0.0.1:${this.options.cdpPort}`;
  }
  get isReady(): boolean {
    return this.ready;
  }

  async start(): Promise<void> {
    if (this.failed || this.stopping) throw new Error('Browserprozess wurde unerwartet beendet.');
    if (this.ready) return;
    if (!this.pending)
      this.pending = this.startProcesses().catch(async (error: unknown) => {
        this.failed = true;
        await this.stop().catch(() => undefined);
        throw error;
      });
    await this.pending;
  }

  private launch(file: string, args: string[]): ChildProcess {
    const child = (this.deps.spawn ?? spawn)(file, args, {
      env: this.environment,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    this.children.push(child);
    child.on('error', () => {
      this.failed = true;
    });
    child.on('exit', () => {
      if (!this.stopping) this.failed = true;
    });
    return child;
  }

  private async startProcesses(): Promise<void> {
    if (this.environment.HOME) await mkdir(this.environment.HOME, { recursive: true, mode: 0o700 });
    await mkdir(this.options.profileDir, { recursive: true, mode: 0o700 });
    const profile = await lstat(this.options.profileDir);
    if (!profile.isDirectory() || profile.isSymbolicLink())
      throw new Error('Ungültiges Browserprofil.');
    if (process.getuid && profile.uid !== process.getuid())
      throw new Error('Browserprofil gehört einem anderen Benutzer.');
    await chmod(this.options.profileDir, 0o700);
    const lock = await lstat(join(this.options.profileDir, 'SingletonLock')).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      },
    );
    if (lock) throw new Error('Browserprofil ist bereits belegt.');
    if (await this.cdpReady()) throw new Error('Browserport ist bereits belegt.');
    this.launch('Xvfb', [':99', '-screen', '0', '1280x900x24', '-nolisten', 'tcp']);
    let displayReady = false;
    for (let attempt = 0; attempt < 40 && !this.failed; attempt++) {
      try {
        await this.execute(['xdotool', 'getdisplaygeometry']);
        displayReady = true;
        break;
      } catch {
        await sleep(100);
      }
    }
    if (!displayReady) throw new Error('Browseranzeige konnte nicht gestartet werden.');
    this.launch('openbox', []);
    this.launch('/usr/bin/google-chrome-stable', [
      `--user-data-dir=${this.options.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--lang=de-DE',
      '--window-size=1280,900',
      '--start-maximized',
      '--disable-background-networking',
      '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${this.options.cdpPort}`,
      'about:blank',
    ]);
    for (let attempt = 0; attempt < 100 && !this.failed; attempt++) {
      if (await this.cdpReady()) {
        this.ready = true;
        return;
      }
      await sleep(100);
    }
    throw new Error('Browser konnte nicht gestartet werden.');
  }

  private async cdpReady(): Promise<boolean> {
    if (this.deps.isCdpReady) return this.deps.isCdpReady();
    try {
      const response = await fetch(`${this.endpoint}/json/version`, {
        signal: AbortSignal.timeout(300),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async execute(args: string[], input?: string): Promise<Buffer> {
    if (this.deps.execute) return this.deps.execute(args, input);
    const [file, ...argumentsList] = args;
    if (!file) throw new Error('Browserkommando fehlt.');
    return new Promise((resolve, reject) => {
      const child = spawn(file, argumentsList, {
        env: this.environment,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const chunks: Buffer[] = [];
      let bytes = 0;
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Browserbedienung dauert zu lange.'));
      }, 5000);
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 6 * 1024 * 1024) {
          child.kill('SIGKILL');
          reject(new Error('Browserantwort ist zu groß.'));
        } else chunks.push(chunk);
      });
      child.on('error', () => {
        clearTimeout(timer);
        reject(new Error('Browserbedienung fehlgeschlagen.'));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new Error('Browserbedienung fehlgeschlagen.'));
      });
      child.stdin.on('error', () => undefined);
      child.stdin.end(input);
    });
  }

  async stop(gracePeriodMs = 0): Promise<void> {
    this.stopping = true;
    for (const child of [...this.children].reverse()) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      // Chrome erhält nach dem regulären Browser.close Zeit, Profil und Sperre
      // selbst zu schließen. Fremde oder übrig gebliebene Sperren löschen wir nicht.
      if (gracePeriodMs && child === this.children.at(-1)) {
        await Promise.race([exited, sleep(gracePeriodMs)]);
        if (child.exitCode !== null || child.signalCode !== null) continue;
      }
      child.kill('SIGTERM');
      let confirmed = false;
      await Promise.race([
        exited.then(() => {
          confirmed = true;
        }),
        sleep(2000),
      ]);
      if (!confirmed) {
        child.kill('SIGKILL');
        await Promise.race([
          exited.then(() => {
            confirmed = true;
          }),
          sleep(2000),
        ]);
      }
      if (!confirmed) throw new Error('Browserprofil wurde nicht bestätigt geschlossen.');
    }
    this.ready = false;
  }
}
