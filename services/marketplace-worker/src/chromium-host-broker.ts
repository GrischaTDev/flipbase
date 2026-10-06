import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { chmod, lstat, mkdir, readdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { BrowserContext } from 'playwright';
import type { BrowserDesktop, BrowserDragPoint } from './gologin-cloud-browser.ts';
import { ChromiumContainerLauncher } from './chromium-container-launcher.ts';
import { ChromiumProfileStore } from './chromium-profile-store.ts';

type LaunchOptions = Parameters<ChromiumContainerLauncher['launch']>[1];
export interface ChromiumHostOperations {
  launch(profileId: string, settings: LaunchOptions): Promise<string>;
  recover(profileId: string): Promise<void>;
  inspect(profileId: string): Promise<number[]>;
  archive(profileId: string): Promise<void>;
  desktop(profileId: string): BrowserDesktop;
}

export function chromiumHostOperations(
  launcher: ChromiumContainerLauncher,
  profileRoot: string,
): ChromiumHostOperations {
  const profiles = new ChromiumProfileStore({
    root: profileRoot,
    inspectProfileProcesses: (directory) => launcher.inspectProfileProcesses(directory),
  });
  const contexts = new Map<string, BrowserContext>();
  return {
    launch: async (profileId, settings) => {
      if (contexts.size >= 8 || contexts.has(profileId)) throw new Error('Browserlimit erreicht');
      if (
        (
          await readdir(profileRoot).catch((error: unknown) => {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
            throw error;
          })
        ).length > 4096
      )
        throw new Error('Profillimit erreicht');
      const directory = await profiles.prepareStopped(profileId);
      const context = await launcher.launch(directory, settings);
      contexts.set(profileId, context);
      return launcher.endpoint(directory);
    },
    recover: async (profileId) => {
      const context = contexts.get(profileId);
      if (context) await context.close();
      await launcher.recover(profileId);
      contexts.delete(profileId);
    },
    inspect: (profileId) => launcher.inspectProfileProcesses(profiles.directory(profileId)),
    archive: async (profileId) => {
      if (contexts.has(profileId)) throw new Error('Browserprofil ist noch geöffnet');
      const directory = profiles.directory(profileId);
      const archiveRoot = join(dirname(profileRoot), 'archive');
      await mkdir(archiveRoot, { recursive: true, mode: 0o700 });
      const status = await lstat(archiveRoot);
      if (
        !status.isDirectory() ||
        status.isSymbolicLink() ||
        (process.platform !== 'win32' && status.uid !== process.getuid?.())
      )
        throw new Error('Unsicheres Profilarchiv');
      await chmod(archiveRoot, 0o700);
      const target = join(archiveRoot, profileId);
      const archived = await lstat(target).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
        throw error;
      });
      if (archived) {
        if (!archived.isDirectory() || archived.isSymbolicLink())
          throw new Error('Unsicheres Profilarchiv');
        // Ein bereits vorhandenes Archiv darf niemals ein neues aktives Profil ersetzen.
        try {
          await lstat(directory);
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
          throw error;
        }
        throw new Error('Profil und Archiv bestehen gleichzeitig');
      }
      await profiles.prepareStopped(profileId);
      await rename(directory, target);
    },
    desktop: (profileId) => launcher.desktop(profiles.directory(profileId)),
  };
}

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Ungültiger Brokerauftrag');
  return input as Record<string, unknown>;
}
function number(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input))
    throw new Error('Ungültige Browserposition');
  return input;
}
function launchSettings(input: unknown): LaunchOptions {
  const settings = record(input);
  const allowed = [
    'headless',
    'chromiumSandbox',
    'locale',
    'viewport',
    'proxy',
    'args',
    'env',
    'acceptDownloads',
    'timeout',
  ];
  if (
    Object.keys(settings).some((key) => !allowed.includes(key)) ||
    (settings.headless !== undefined && settings.headless !== false) ||
    (settings.chromiumSandbox !== undefined && settings.chromiumSandbox !== true) ||
    (settings.locale !== undefined && settings.locale !== 'de-DE') ||
    (settings.acceptDownloads !== undefined && settings.acceptDownloads !== false) ||
    (settings.timeout !== undefined && settings.timeout !== 60_000)
  )
    throw new Error('Ungültiger Browserstart');
  if (
    settings.args !== undefined &&
    (!Array.isArray(settings.args) ||
      settings.args.some((argument) => argument !== '--disable-dev-shm-usage'))
  )
    throw new Error('Ungültige Browserargumente');
  if (
    settings.env !== undefined &&
    Object.values(record(settings.env)).some((value) => typeof value !== 'string')
  )
    throw new Error('Ungültige Browserumgebung');
  const viewport =
    settings.viewport === undefined ? { width: 1280, height: 900 } : record(settings.viewport);
  if (
    Object.keys(viewport).some((key) => !['width', 'height'].includes(key)) ||
    typeof viewport.width !== 'number' ||
    !Number.isSafeInteger(viewport.width) ||
    viewport.width < 640 ||
    viewport.width > 2560 ||
    typeof viewport.height !== 'number' ||
    !Number.isSafeInteger(viewport.height) ||
    viewport.height < 480 ||
    viewport.height > 1600
  )
    throw new Error('Ungültige Browseranzeige');
  if (settings.proxy !== undefined) {
    const proxy = record(settings.proxy);
    const address = new URL(String(proxy.server));
    if (
      Object.keys(proxy).some((key) => !['server', 'username', 'password'].includes(key)) ||
      typeof proxy.server !== 'string' ||
      address.protocol !== 'http:' ||
      address.username ||
      address.password ||
      address.pathname !== '/' ||
      address.search ||
      address.hash ||
      (proxy.username !== undefined &&
        (typeof proxy.username !== 'string' || proxy.username.length > 1024)) ||
      (proxy.password !== undefined &&
        (typeof proxy.password !== 'string' || proxy.password.length > 1024))
    )
      throw new Error('Ungültige Proxykonfiguration');
  }
  return settings as LaunchOptions;
}

export async function dispatchChromiumHostCommand(
  input: unknown,
  operations: ChromiumHostOperations,
): Promise<unknown> {
  const request = record(input);
  const profileId = request.profileId;
  if (
    typeof profileId !== 'string' ||
    !/^chromium_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(profileId)
  )
    throw new Error('Ungültige Profilkennung');
  const keys: Record<string, string[]> = {
    launch: ['settings'],
    recover: [],
    inspect: [],
    archive: [],
    capture: [],
    click: ['x', 'y'],
    type: ['text'],
    press: ['key'],
    drag: ['points'],
  };
  const action = request.action;
  if (
    typeof action !== 'string' ||
    !Object.hasOwn(keys, action) ||
    Object.keys(request).some(
      (key) => !['action', 'profileId', ...(keys[action] ?? [])].includes(key),
    )
  )
    throw new Error('Nicht erlaubter Brokerauftrag');
  if (action === 'launch')
    return { endpoint: await operations.launch(profileId, launchSettings(request.settings)) };
  if (action === 'recover') {
    await operations.recover(profileId);
    return {};
  }
  if (action === 'inspect') return { processes: await operations.inspect(profileId) };
  if (action === 'archive') {
    await operations.archive(profileId);
    return {};
  }
  const desktop = operations.desktop(profileId);
  if (action === 'capture')
    return { image: Buffer.from(await desktop.capture()).toString('base64') };
  if (action === 'click') await desktop.click(number(request.x), number(request.y));
  if (action === 'type') {
    if (typeof request.text !== 'string') throw new Error('Ungültiger Browsertext');
    await desktop.type(request.text);
  }
  if (action === 'press') {
    if (!['Enter', 'Tab', 'Escape', 'Backspace'].includes(String(request.key)))
      throw new Error('Ungültige Browsertaste');
    await desktop.press(request.key as 'Enter' | 'Tab' | 'Escape' | 'Backspace');
  }
  if (action === 'drag') {
    if (!Array.isArray(request.points) || request.points.length > 256)
      throw new Error('Ungültige Browserbewegung');
    const points: BrowserDragPoint[] = request.points.map((inputPoint) => {
      const point = record(inputPoint);
      if (Object.keys(point).some((key) => !['x', 'y', 'elapsedMs'].includes(key)))
        throw new Error('Ungültige Browserbewegung');
      return { x: number(point.x), y: number(point.y), elapsedMs: number(point.elapsedMs) };
    });
    await desktop.drag(points);
  }
  return {};
}

export function chromiumHostHandler(token: string, operations: ChromiumHostOperations) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Privater Broker-Schlüssel fehlt');
  let pending = Promise.resolve();
  let queued = 0;
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const authorization = Buffer.from(request.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    response.setHeader('Cache-Control', 'no-store');
    if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
      response.writeHead(401).end();
      return;
    }
    if (request.method !== 'POST' || request.url !== '/command') {
      response.writeHead(404).end();
      return;
    }
    if (queued >= 32) {
      response.writeHead(429).end();
      return;
    }
    queued += 1;
    try {
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk);
        length += bytes.length;
        if (length > 32_768) throw new Error('Brokerauftrag zu groß');
        chunks.push(bytes);
      }
      const input: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const command = pending.then(() => dispatchChromiumHostCommand(input, operations));
      pending = command.then(
        () => undefined,
        () => undefined,
      );
      const result = await command;
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
    } catch {
      response.writeHead(409).end('{"error":"Browserauftrag nicht bestätigt"}');
    } finally {
      queued -= 1;
    }
  };
}
