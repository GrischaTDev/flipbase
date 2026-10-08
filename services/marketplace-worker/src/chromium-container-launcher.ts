import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { posix } from 'node:path';
import type { chromium } from 'playwright';
import { browserCommandLimit, commandRecord } from './isolated-browser-actions.ts';
import { CloudBrowserStopUncertainError } from './gologin-cloud-browser.ts';
import { DockerSessionChannel } from './docker-session-channel.ts';
import { ChromiumDesktopControls } from './chromium-desktop-controls.ts';

type LaunchOptions = NonNullable<Parameters<typeof chromium.launchPersistentContext>[1]>;
type DockerExecute = (argumentsList: string[], input?: string) => Promise<string>;
export interface ChromiumContainerLauncherOptions {
  image: string;
  profileRoot: string;
  hostProfileRoot: string;
  hostId: string;
  network: string;
  seccompProfile?: string;
  firewallStatusFile?: string;
  execute?: DockerExecute;
  verifyFirewall?: () => Promise<void>;
  executeDesktop?: (argumentsList: string[], input?: string) => Promise<Buffer>;
}

async function executeDocker(argumentsList: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'docker',
      ['--host=unix:///var/run/docker.sock', ...argumentsList],
      {
        timeout: 150_000,
        maxBuffer: browserCommandLimit,
        // Kein Docker-Kontext oder Zugangsschlüssel aus dem Browserprofil übernehmen.
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      },
      (error, stdout) =>
        error
          ? reject(new Error('Docker-Sitzungsoperation fehlgeschlagen'))
          : resolve(stdout.trim()),
    );
    child.stdin?.end(input ?? '');
  });
}

async function executeDockerDesktop(argumentsList: string[], input?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'docker',
      ['--host=unix:///var/run/docker.sock', ...argumentsList],
      {
        encoding: 'buffer',
        timeout: 15_000,
        maxBuffer: 8 * 1024 * 1024,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      },
      (error, stdout) =>
        error ? reject(new Error('Private Browserbedienung fehlgeschlagen')) : resolve(stdout),
    );
    child.stdin?.end(input ?? '');
  });
}

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new CloudBrowserStopUncertainError();
  return input as Record<string, unknown>;
}
function array(input: unknown): unknown[] {
  if (!Array.isArray(input)) throw new CloudBrowserStopUncertainError();
  return input;
}

function isConfirmedStopped(state: Record<string, unknown>): boolean {
  return (
    state.Status === 'exited' &&
    state.Running === false &&
    state.Paused === false &&
    state.Dead === false &&
    state.Restarting === false &&
    state.Pid === 0 &&
    state.OOMKilled === false
  );
}

function isCleanStartupFailure(state: Record<string, unknown>): boolean {
  return state.ExitCode === 78 && isConfirmedStopped(state);
}

export class ChromiumContainerLauncher {
  private readonly options: ChromiumContainerLauncherOptions;
  private readonly execute: DockerExecute;
  private readonly channels = new Map<string, DockerSessionChannel>();
  private readonly desktops = new Map<
    string,
    { containerId: string; width: number; height: number }
  >();

  constructor(options: ChromiumContainerLauncherOptions) {
    if (
      !/^ghcr\.io\/grischatdev\/flipbase-chromium-session(?::sha-[a-f0-9]{40}|@sha256:[a-f0-9]{64})$/.test(
        options.image,
      ) ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(options.hostId) ||
      options.network !== 'flipbase-browser'
    ) {
      throw new Error('Ungültige vertrauenswürdige Chromium-Containerkonfiguration');
    }
    for (const directory of [
      options.profileRoot,
      options.hostProfileRoot,
      options.seccompProfile ?? '/opt/flipbase-marketplace/chromium-seccomp.json',
    ]) {
      if (
        !posix.isAbsolute(directory) ||
        posix.normalize(directory) !== directory ||
        directory === '/' ||
        /[,\n\r]/.test(directory)
      )
        throw new Error('Ungültiger Chromium-Profilpfad');
    }
    this.options = options;
    this.execute = options.execute ?? executeDocker;
  }

  private profileId(directory: string): string {
    const profileId = posix.relative(this.options.profileRoot, directory);
    if (
      directory !== posix.join(this.options.profileRoot, profileId) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(profileId)
    )
      throw new Error('Ungültiger Chromium-Profilpfad');
    return profileId;
  }

  private async verifyNetwork(): Promise<void> {
    if (this.options.verifyFirewall) await this.options.verifyFirewall();
    else {
      const attestation = record(
        JSON.parse(
          await readFile(
            this.options.firewallStatusFile ?? '/run/flipbase/chromium-firewall-status.json',
            'utf8',
          ),
        ),
      );
      const bootId = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
      if (
        attestation.bootId !== bootId ||
        attestation.network !== this.options.network ||
        attestation.policy !== 'v3' ||
        typeof attestation.checkedAt !== 'number' ||
        Date.now() - attestation.checkedAt > 90_000 ||
        attestation.checkedAt > Date.now()
      ) {
        throw new Error('Aktuelle Host-Firewallprüfung für Chromium fehlt');
      }
    }
    const network = record(
      array(JSON.parse(await this.execute(['network', 'inspect', this.options.network])))[0],
    );
    const labels = record(network.Labels);
    const ipam = record(network.IPAM);
    const networkOptions = record(network.Options);
    if (
      network.Name !== this.options.network ||
      network.Driver !== 'bridge' ||
      network.EnableIPv6 !== false ||
      labels['de.flipbase.chromium.network-policy'] !== 'v1' ||
      networkOptions['com.docker.network.bridge.name'] !== 'br-flipbase' ||
      array(ipam.Config).length !== 1 ||
      record(array(ipam.Config)[0]).Subnet !== '172.30.88.0/24' ||
      record(array(ipam.Config)[0]).IPRange !== '172.30.88.128/25' ||
      record(array(ipam.Config)[0]).Gateway !== '172.30.88.1'
    ) {
      throw new Error('Ungesichertes Chromium-Sitzungsnetz');
    }
  }

  private safeLaunchOptions(options: LaunchOptions): Record<string, unknown> {
    const allowed = new Set([
      'headless',
      'chromiumSandbox',
      'locale',
      'viewport',
      'proxy',
      'args',
      'env',
      'acceptDownloads',
      'timeout',
    ]);
    const allowedEnvironment = new Set([
      'PATH',
      'HOME',
      'LANG',
      'LC_ALL',
      'DISPLAY',
      'TMPDIR',
      'XDG_RUNTIME_DIR',
      'TZ',
      'SYSTEMROOT',
      'WINDIR',
      'TEMP',
      'TMP',
    ]);
    if (
      Object.keys(options).some((key) => !allowed.has(key)) ||
      options.chromiumSandbox === false ||
      options.args?.some((argument) => argument !== '--disable-dev-shm-usage') ||
      options.acceptDownloads === true ||
      (options.timeout !== undefined && options.timeout !== 60_000) ||
      (options.env && Object.keys(options.env).some((key) => !allowedEnvironment.has(key)))
    ) {
      throw new Error('Nicht erlaubte Chromium-Startoption');
    }
    return {
      headless: options.headless ?? false,
      locale: options.locale ?? 'de-DE',
      viewport: options.viewport ?? { width: 1280, height: 900 },
      ...(options.proxy ? { proxy: options.proxy } : {}),
    };
  }

  private filters(profileId: string): string[] {
    return [
      '--filter',
      'label=de.flipbase.chromium.role=session',
      '--filter',
      `label=de.flipbase.chromium.host=${this.options.hostId}`,
      '--filter',
      `label=de.flipbase.chromium.profile=${profileId}`,
    ];
  }
  private async containers(profileId: string): Promise<string[]> {
    const output = await this.execute([
      'ps',
      '--all',
      '--quiet',
      '--no-trunc',
      ...this.filters(profileId),
    ]);
    const identifiers = output.trim() ? output.trim().split(/\s+/) : [];
    if (identifiers.some((identifier) => !/^[a-f0-9]{64}$/.test(identifier)))
      throw new CloudBrowserStopUncertainError();
    return identifiers;
  }
  private async inspect(containerId: string, profileId: string): Promise<Record<string, unknown>> {
    const container = record(array(JSON.parse(await this.execute(['inspect', containerId])))[0]);
    const labels = record(record(container.Config).Labels);
    const mounts = array(container.Mounts);
    if (
      container.Id !== containerId ||
      labels['de.flipbase.chromium.role'] !== 'session' ||
      labels['de.flipbase.chromium.host'] !== this.options.hostId ||
      labels['de.flipbase.chromium.profile'] !== profileId ||
      mounts.length !== 1 ||
      record(mounts[0]).Source !== posix.join(this.options.hostProfileRoot, profileId) ||
      record(mounts[0]).Destination !== '/profile' ||
      record(mounts[0]).RW !== true
    )
      throw new CloudBrowserStopUncertainError();
    return container;
  }

  async inspectProfileProcesses(directory: string): Promise<number[]> {
    const profileId = this.profileId(directory);
    const containers = await this.containers(profileId);
    for (const containerId of containers) await this.inspect(containerId, profileId);
    // Container im Zustand exited bleiben bis zur verifizierten Bereinigung gesperrt.
    return containers.map((_, index) => index + 1);
  }

  private async stopAndRemove(containerId: string, profileId: string): Promise<void> {
    this.channels.get(containerId)?.close();
    this.channels.delete(containerId);
    let container = await this.inspect(containerId, profileId);
    if (record(container.State).Running === true) {
      await this.execute(['stop', '--time', '120', containerId]);
      container = await this.inspect(containerId, profileId);
    }
    const state = record(container.State);
    // Auch ein Laufzeitfehler (1) kann bereits beendet sein. Der Exitcode allein
    // bestätigt den Stopp nicht; Prozess- und Containerzustand müssen ihn belegen.
    if (
      !isConfirmedStopped(state) ||
      (state.ExitCode !== 0 && state.ExitCode !== 1 && state.ExitCode !== 78)
    )
      throw new CloudBrowserStopUncertainError();
    await this.execute(['rm', containerId]);
    if ((await this.containers(profileId)).includes(containerId))
      throw new CloudBrowserStopUncertainError();
    if (this.desktops.get(profileId)?.containerId === containerId) this.desktops.delete(profileId);
  }

  async recover(profileId: string): Promise<void> {
    this.profileId(posix.join(this.options.profileRoot, profileId));
    for (const containerId of await this.containers(profileId))
      await this.stopAndRemove(containerId, profileId);
    if ((await this.containers(profileId)).length) throw new CloudBrowserStopUncertainError();
  }

  async launch(
    directory: string,
    options: LaunchOptions = {},
    remoteEndpoint?: string,
  ): Promise<void> {
    const profileId = this.profileId(directory);
    const launchOptions = this.safeLaunchOptions(options);
    if (remoteEndpoint !== undefined) {
      if (!/^ws:\/\/172\.30\.88\.3:4181\/session\/[0-9a-f-]{36}$/.test(remoteEndpoint))
        throw new Error('Ungültiger GoLogin-Sitzungskanal');
      launchOptions.remoteEndpoint = remoteEndpoint;
    }
    await this.verifyNetwork();
    const image = record(
      array(JSON.parse(await this.execute(['image', 'inspect', this.options.image])))[0],
    );
    if (
      record(record(image.Config).Labels)['de.flipbase.chromium.runtime'] !== 'isolated-actions-v1'
    )
      throw new Error('Das Cloud-Browserimage benötigt den normalen Chrome-Desktop');
    if ((await this.inspectProfileProcesses(directory)).length)
      throw new CloudBrowserStopUncertainError();
    const containerId = (
      await this.execute([
        'create',
        '--name',
        `flipbase-chromium-${this.options.hostId}-${randomUUID()}`,
        '--label',
        'de.flipbase.chromium.role=session',
        '--label',
        `de.flipbase.chromium.host=${this.options.hostId}`,
        '--label',
        `de.flipbase.chromium.profile=${profileId}`,
        '--network',
        this.options.network,
        '--init',
        '--user=1000:1000',
        '--read-only',
        '--cap-drop=ALL',
        '--security-opt=no-new-privileges:true',
        `--security-opt=seccomp=${this.options.seccompProfile ?? '/opt/flipbase-marketplace/chromium-seccomp.json'}`,
        '--memory=2g',
        '--memory-swap=2g',
        '--pids-limit=512',
        '--shm-size=256m',
        '--tmpfs=/tmp:rw,nosuid,nodev,size=512m,uid=1000,gid=1000,mode=700',
        '--tmpfs=/home/node:rw,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=700',
        '--mount',
        `type=bind,src=${posix.join(this.options.hostProfileRoot, profileId)},dst=/profile`,
        '--log-driver=none',
        this.options.image,
      ])
    ).trim();
    if (!/^[a-f0-9]{64}$/.test(containerId)) throw new CloudBrowserStopUncertainError();
    try {
      await this.inspect(containerId, profileId);
      await this.execute(['start', containerId]);
      await this.execute(
        [
          'exec',
          '-i',
          containerId,
          'node',
          '--input-type=module',
          '-e',
          "import{writeFile,rename}from'node:fs/promises';let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>16384)process.exit(1)}await writeFile('/tmp/startup.pending',input,{mode:0o600,flag:'wx'});await rename('/tmp/startup.pending','/tmp/startup.json');",
        ],
        JSON.stringify(launchOptions),
      );
      const container = await this.inspect(containerId, profileId);
      const networks = record(record(container.NetworkSettings).Networks);
      const address = record(networks[this.options.network]).IPAddress;
      if (
        Object.keys(networks).length !== 1 ||
        typeof address !== 'string' ||
        !/^172\.30\.88\.(?:12[89]|1[3-9]\d|2[0-4]\d|25[0-4])$/.test(address)
      )
        throw new Error('Ungültiger privater Chromium-Endpunkt');
      const dimensions = record(launchOptions.viewport);
      if (typeof dimensions.width !== 'number' || typeof dimensions.height !== 'number')
        throw new Error('Browseranzeige fehlt');
      this.desktops.set(profileId, {
        containerId,
        width: dimensions.width,
        height: dimensions.height,
      });
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        try {
          const ready = commandRecord(await this.command(profileId, { action: 'ready' }));
          if (ready.ready === true) return;
        } catch {
          // Fehlermeldungen aus dem Container bleiben privat.
        }
        const state = record((await this.inspect(containerId, profileId)).State);
        if (isCleanStartupFailure(state)) throw new Error('Chromium-Start wurde beendet');
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error('Chromium-Sitzung nicht bereit');
    } catch {
      try {
        await this.stopAndRemove(containerId, profileId);
      } catch {
        throw new CloudBrowserStopUncertainError();
      }
      throw new Error('Chromium-Containerstart fehlgeschlagen');
    }
  }

  desktop(directory: string): ChromiumDesktopControls {
    const profileId = this.profileId(directory);
    const session = this.desktops.get(profileId);
    if (!session) throw new Error('Browseranzeige fehlt');
    return new ChromiumDesktopControls({
      width: session.width,
      height: session.height,
      authorize: async () => {
        if (this.desktops.get(profileId) !== session) throw new Error('Browsersitzung beendet');
        const state = record((await this.inspect(session.containerId, profileId)).State);
        if (state.Running !== true || state.Paused !== false || state.Restarting !== false)
          throw new Error('Browsersitzung nicht verfügbar');
      },
      execute: (argumentsList, input) =>
        (this.options.executeDesktop ?? executeDockerDesktop)(
          ['exec', '-i', session.containerId, ...argumentsList],
          input,
        ),
    });
  }

  async command(profileId: string, input: unknown): Promise<unknown> {
    const session = this.desktops.get(profileId);
    if (!session) throw new Error('Browsersitzung fehlt');
    // Der offene Kanal ist an eine unveränderliche Container-ID gebunden. Stopp schließt ihn;
    // ein beendeter oder pausierter Container liefert keine erfolgreiche Befehlsantwort.
    if (this.options.execute || !this.channels.has(session.containerId)) {
      const state = record((await this.inspect(session.containerId, profileId)).State);
      if (state.Running !== true || state.Paused !== false || state.Restarting !== false)
        throw new Error('Browsersitzung nicht verfügbar');
    }
    const serialized = JSON.stringify(input);
    if (Buffer.byteLength(serialized) > browserCommandLimit)
      throw new Error('Browserauftrag zu groß');
    if (!this.options.execute) {
      let channel = this.channels.get(session.containerId);
      if (!channel) {
        channel = new DockerSessionChannel(session.containerId);
        this.channels.set(session.containerId, channel);
      }
      try {
        return await channel.request(input);
      } catch (error) {
        channel.close();
        if (this.channels.get(session.containerId) === channel)
          this.channels.delete(session.containerId);
        throw error;
      }
    }
    const output = await this.execute(
      [
        'exec',
        '-i',
        session.containerId,
        'node',
        '--experimental-strip-types',
        '/app/runtime/session-command.ts',
      ],
      serialized,
    );
    if (Buffer.byteLength(output) > browserCommandLimit) throw new Error('Browserantwort zu groß');
    return JSON.parse(output);
  }
}
