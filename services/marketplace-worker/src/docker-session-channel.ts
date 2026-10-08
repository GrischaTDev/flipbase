import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { browserCommandLimit } from './isolated-browser-actions.ts';

/** Ein fester Docker-stdin-Kanal je laufendem Container statt Prozessstarts je Freigabe. */
export class DockerSessionChannel {
  private readonly child: ChildProcessWithoutNullStreams;
  private pending?: {
    resolve(input: unknown): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
  };
  private buffer = '';
  private stopped = false;
  constructor(containerId: string, spawnProcess: typeof spawn = spawn) {
    if (!/^[a-f0-9]{64}$/.test(containerId)) throw new Error('Ungültiger Sitzungscontainer');
    this.child = spawnProcess(
      'docker',
      [
        '--host=unix:///var/run/docker.sock',
        'exec',
        '-i',
        containerId,
        'node',
        '--experimental-strip-types',
        '/app/runtime/session-channel.ts',
      ],
      { env: { PATH: process.env.PATH, HOME: process.env.HOME }, stdio: 'pipe' },
    );
    this.child.stderr.resume();
    this.child.stdout.setEncoding('utf8');
    this.child.on('error', () => this.close());
    this.child.on('exit', () => this.close());
    this.child.stdin.on('error', () => this.close());
    this.child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      if (Buffer.byteLength(this.buffer) > browserCommandLimit) {
        this.close();
        return;
      }
      const end = this.buffer.indexOf('\n');
      if (end < 0) return;
      const pending = this.pending;
      if (!pending || end !== this.buffer.length - 1) {
        this.close();
        return;
      }
      let result: unknown;
      try {
        result = JSON.parse(this.buffer.slice(0, end));
      } catch {
        this.close();
        return;
      }
      this.buffer = '';
      this.pending = undefined;
      clearTimeout(pending.timer);
      pending.resolve(result);
    });
  }
  request(input: unknown): Promise<unknown> {
    if (this.stopped || this.pending)
      return Promise.reject(new Error('Sitzungskanal nicht verfügbar'));
    const serialized = JSON.stringify(input);
    if (Buffer.byteLength(serialized) > browserCommandLimit)
      return Promise.reject(new Error('Browserauftrag zu groß'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.close(), 15000);
      this.pending = { resolve, reject, timer };
      this.child.stdin.write(`${serialized}\n`, (error) => {
        if (error) this.close();
      });
    });
  }
  close(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('Sitzungskanal beendet'));
      this.pending = undefined;
    }
    this.child.stdin.end();
    this.child.kill();
  }
}
