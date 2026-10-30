import { chromium, type CDPSession } from 'playwright';
import type { BrowserInput } from './browser-types.js';
import { BrowserCleanup } from './browser-cleanup.js';
import { BrowserDesktop } from './browser-desktop.js';
import { ChromeProcess, type ChromeProcessOptions } from './chrome-process.js';
import { VintedNetworkError, VintedTimeoutError } from '../vinted/errors.js';
import { readCatalogResponse } from './catalog-response.js';
import { abortableBrowserOperation } from './request-abort.js';

interface PausedRequest {
  requestId: string;
  resourceType: string;
  frameId: string;
  request: { url: string };
  responseStatusCode?: number;
  responseErrorReason?: string;
  responseHeaders?: { name: string; value: string }[];
}

export async function readBrowserDocument(
  session: CDPSession,
  url: URL,
  signal?: AbortSignal,
  cleanup = new BrowserCleanup(),
  timeoutMs = 20_000,
): Promise<Response> {
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let settled = false;
  let completed = false;
  let cacheDisabled = false;
  let networkEnabled = false;
  let mainFrameId = '';
  let loaderId: string | undefined;
  let documentResponse: Response | undefined;
  let sessionRefreshUrl: string | undefined;
  const loadedDocuments = new Set<string>();
  const pausedRequests = new Set<string>();
  let resolveResponse: (response: Response) => void = () => undefined;
  let rejectResponse: (error: unknown) => void = () => undefined;
  const response = new Promise<Response>((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  void response.catch(() => undefined);
  const onAbort = () => {
    settled = true;
    rejectResponse(requestSignal.reason);
  };
  requestSignal.addEventListener('abort', onAbort, { once: true });
  const completeDocument = () => {
    if (!settled && documentResponse && loaderId && loadedDocuments.has(loaderId)) {
      settled = true;
      completed = true;
      resolveResponse(documentResponse);
    }
  };
  const onLifecycle = (event: { frameId: string; loaderId: string; name: string }) => {
    if (event.frameId !== mainFrameId || event.name !== 'load') return;
    loadedDocuments.add(event.loaderId);
    completeDocument();
  };
  const onFrameNavigated = (event: { frame: { id: string; url: string; loaderId: string } }) => {
    if (event.frame.id !== mainFrameId) return;
    // Die Erneuerungsseite ist kein Katalog. Nur dessen neuer Ladevorgang zählt.
    loaderId = event.frame.url === url.href ? event.frame.loaderId : undefined;
    completeDocument();
  };
  const processPaused = async (event: PausedRequest) => {
    pausedRequests.add(event.requestId);
    if (!settled && event.frameId !== mainFrameId) {
      await session.send(
        event.responseStatusCode === undefined ? 'Fetch.continueRequest' : 'Fetch.continueResponse',
        { requestId: event.requestId },
      );
      pausedRequests.delete(event.requestId);
      return;
    }
    if (settled || (event.request.url !== url.href && event.request.url !== sessionRefreshUrl)) {
      await session.send('Fetch.failRequest', {
        requestId: event.requestId,
        errorReason: 'Aborted',
      });
      pausedRequests.delete(event.requestId);
      return;
    }
    if (event.responseStatusCode === undefined) {
      if (event.responseErrorReason) throw browserNetworkError(event.responseErrorReason);
      await session.send('Fetch.continueRequest', { requestId: event.requestId });
      pausedRequests.delete(event.requestId);
      return;
    }
    const status = event.responseStatusCode;
    const headers = new Headers();
    for (const header of event.responseHeaders ?? []) {
      if (!['set-cookie', 'content-encoding', 'content-length'].includes(header.name.toLowerCase()))
        headers.append(header.name, header.value);
    }
    // Vinteds reguläre Sitzungserneuerung einmal innerhalb desselben Zeitlimits zulassen.
    // Andere Weiterleitungen und abweichende Rückziele bleiben gesperrt.
    const refreshTarget =
      status === 307 &&
      headers.get('cf-mitigated') !== 'challenge' &&
      !sessionRefreshUrl &&
      event.request.url === url.href
        ? sessionRefreshTarget(headers.get('location'), url)
        : null;
    if (refreshTarget) {
      sessionRefreshUrl = refreshTarget;
      loaderId = undefined;
      await session.send('Fetch.continueResponse', { requestId: event.requestId });
      pausedRequests.delete(event.requestId);
      return;
    }
    const chunks: Buffer[] = [];
    if (![204, 304].includes(status) && !(status >= 300 && status < 400)) {
      const { stream } = await session.send('Fetch.takeResponseBodyAsStream', {
        requestId: event.requestId,
      });
      try {
        let bytes = 0;
        for (;;) {
          requestSignal.throwIfAborted();
          const chunk = await session.send('IO.read', { handle: stream, size: 64 * 1024 });
          const buffer = Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8');
          bytes += buffer.length;
          if (bytes > 8 * 1024 * 1024) throw new Error('Vinted-Katalogantwort ist zu groß.');
          chunks.push(buffer);
          if (chunk.eof) break;
        }
      } finally {
        if (!cleanup.expired) await session.send('IO.close', { handle: stream });
      }
    }
    requestSignal.throwIfAborted();
    const body = Buffer.concat(chunks);
    const html = body.toString('utf8');
    const currentResponse = new Response([204, 304].includes(status) ? null : html, {
      status,
      headers,
    });
    const refreshing = event.request.url === sessionRefreshUrl;
    if (!refreshing || !currentResponse.ok || headers.get('cf-mitigated') === 'challenge')
      documentResponse = currentResponse;
    const refreshChallenge =
      refreshing &&
      (html.includes('challenge-running') || html.includes('<title>Just a moment...</title>'));
    // Prüfseiteninhalt unverändert an die bestehende Sammlerprüfung weiterreichen.
    // Weiterleitungen starten keinen unbestellten Katalog-/Loginabruf.
    if (refreshChallenge || [204, 304].includes(status) || (status >= 300 && status < 400)) {
      await session.send('Fetch.failRequest', {
        requestId: event.requestId,
        errorReason: 'Aborted',
      });
      pausedRequests.delete(event.requestId);
      settled = true;
      completed = true;
      resolveResponse(currentResponse);
      return;
    }
    // Das gelesene Original bleibt ausführbar: Sitzungs-Skripte dürfen Cookies erneuern.
    // CDP liefert entpackte Bytes; deren ursprüngliche Längen-/Kodierungsheader entfallen.
    await session.send('Fetch.fulfillRequest', {
      requestId: event.requestId,
      responseCode: status,
      responseHeaders: (event.responseHeaders ?? []).filter(
        (header) => !['content-encoding', 'content-length'].includes(header.name.toLowerCase()),
      ),
      body: body.toString('base64'),
    });
    pausedRequests.delete(event.requestId);
    if (settled) return;
    // Eine bekannte Ablehnung darf nicht durch langsame Nebenanfragen zum Timeout werden.
    if (!currentResponse.ok || headers.get('cf-mitigated') === 'challenge') {
      settled = true;
      completed = true;
      resolveResponse(currentResponse);
      return;
    }
    completeDocument();
  };
  const onPaused = (event: PausedRequest) => {
    void processPaused(event).catch((error: unknown) => {
      if (!settled) {
        settled = true;
        rejectResponse(error);
      }
    });
  };
  session.on('Fetch.requestPaused', onPaused);
  session.on('Page.lifecycleEvent', onLifecycle);
  session.on('Page.frameNavigated', onFrameNavigated);
  try {
    await abortableBrowserOperation(session.send('Page.enable'), requestSignal);
    const { frameTree } = await abortableBrowserOperation(
      session.send('Page.getFrameTree'),
      requestSignal,
    );
    mainFrameId = frameTree.frame.id;
    await abortableBrowserOperation(
      session.send('Page.setLifecycleEventsEnabled', { enabled: true }),
      requestSignal,
    );
    await abortableBrowserOperation(
      session.send('Network.setBypassServiceWorker', { bypass: false }),
      requestSignal,
    );
    // Auch der Dokument-Warmup und die reguläre Sitzungserneuerung benötigen
    // eine frische Antwort; ein alter 200-Katalog darf einen neuen 307 verdecken.
    networkEnabled = true;
    await abortableBrowserOperation(session.send('Network.enable'), requestSignal);
    cacheDisabled = true;
    await abortableBrowserOperation(
      session.send('Network.setCacheDisabled', { cacheDisabled: true }),
      requestSignal,
    );
    await abortableBrowserOperation(
      session.send('Fetch.enable', {
        patterns: [
          { urlPattern: '*', resourceType: 'Document', requestStage: 'Request' },
          { urlPattern: '*', resourceType: 'Document', requestStage: 'Response' },
        ],
      }),
      requestSignal,
    );
    requestSignal.throwIfAborted();
    const navigation = session.send('Page.navigate', { url: url.href }).then((result) => {
      if (result.errorText && !settled) throw browserNetworkError(result.errorText);
      if (!sessionRefreshUrl) loaderId ??= result.loaderId;
      completeDocument();
      return response;
    });
    // Auch vor der Navigationsantwort muss Timeout/Abbruch die Bereinigung erreichen.
    return await Promise.race([navigation, response]);
  } finally {
    settled = true;
    session.off('Fetch.requestPaused', onPaused);
    session.off('Page.lifecycleEvent', onLifecycle);
    session.off('Page.frameNavigated', onFrameNavigated);
    requestSignal.removeEventListener('abort', onAbort);
    // Erfolgreiche Seiten bleiben lebendig, auch für verzögert gestartete Erneuerung.
    if (!completed) await cleanup.run(() => session.send('Page.stopLoading'));
    for (const requestId of pausedRequests) {
      await cleanup.run(() =>
        session.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }),
      );
    }
    await cleanup.run(() => session.send('Fetch.disable'));
    if (cacheDisabled)
      await cleanup.run(() => session.send('Network.setCacheDisabled', { cacheDisabled: false }));
    if (networkEnabled) await cleanup.run(() => session.send('Network.disable'));
    await cleanup.run(() => session.send('Page.setLifecycleEventsEnabled', { enabled: false }));
  }
}

function sessionRefreshTarget(location: string | null, requestedUrl: URL): string | null {
  if (!location) return null;
  try {
    const target = new URL(location, requestedUrl);
    if (
      target.origin !== requestedUrl.origin ||
      target.username ||
      target.password ||
      target.hash ||
      target.pathname !== '/session-refresh' ||
      target.searchParams.size !== 1 ||
      target.searchParams.get('ref_url') !== requestedUrl.pathname + requestedUrl.search
    )
      return null;
    return target.href;
  } catch {
    return null;
  }
}

function browserNetworkError(reason: string): VintedNetworkError {
  // Nur Chromiums Fehlerkennung übernehmen, keine URLs oder Browserdetails protokollieren.
  const code = reason.match(/^net::ERR_[A-Z0-9_]+$|^[A-Za-z]+$/)?.[0] ?? 'Unknown';
  return new VintedNetworkError(`Browserabruf fehlgeschlagen (${code}).`);
}

export interface VintedBrowser {
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  openManual(url: URL): Promise<void>;
  stopManual(): Promise<void>;
  captureFrame(): Promise<Uint8Array>;
  input(command: BrowserInput): Promise<void>;
  close(): Promise<void>;
}

export class ChromeVintedBrowser implements VintedBrowser {
  private readonly runtime: ChromeProcess;
  private readonly desktop: BrowserDesktop;
  private manual = false;
  private requestsSinceTabChange = 0;
  private recycleAfterFailure = false;
  private unresponsive = false;
  private closing: Promise<void> | undefined;
  private previousRequest: Promise<void> = Promise.resolve();
  private catalogReady = false;
  private readonly requestTimeoutMs: number;

  get needsRestart(): boolean {
    return this.unresponsive || this.runtime.hasFailed;
  }

  constructor(
    private readonly baseUrl: string,
    options: ChromeProcessOptions & { requestTimeoutMs?: number },
  ) {
    this.runtime = new ChromeProcess(options);
    this.requestTimeoutMs = options.requestTimeoutMs ?? 20_000;
    this.desktop = new BrowserDesktop((args, input) => this.runtime.execute(args, input));
  }

  private validateUrl(input: string | URL): URL {
    const url = new URL(input);
    const base = new URL(this.baseUrl);
    if (
      url.origin !== base.origin ||
      !['/', '/catalog'].includes(url.pathname) ||
      url.username ||
      url.password
    )
      throw new Error('Ungültige Vinted-Katalogadresse.');
    return url;
  }

  async fetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const request = this.previousRequest.then(() => this.fetchSerial(input, init));
    this.previousRequest = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  }

  private async fetchSerial(input: string | URL, init?: RequestInit): Promise<Response> {
    if (this.manual) throw new Error('Die Botsitzung wird gerade manuell bedient.');
    if (this.needsRestart) throw new Error('Der Feed-Browser muss neu gestartet werden.');
    const url = this.validateUrl(input);
    if (init?.method && init.method.toUpperCase() !== 'GET')
      throw new Error('Nur Katalog-GETs sind erlaubt.');
    init?.signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(this.requestTimeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const cleanup = new BrowserCleanup();
    let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
    try {
      await abortableBrowserOperation(this.runtime.start(), signal);
      if (this.needsRestart) throw new Error('Der Feed-Browser wird bereits beendet.');
      browser = await abortableBrowserOperation(
        chromium.connectOverCDP(this.runtime.endpoint, {
          noDefaults: true,
          timeout: 5000,
        }),
        signal,
        (late) => new BrowserCleanup().run(() => late.close()),
      );
      signal.throwIfAborted();
      if (this.needsRestart) throw new Error('Der Feed-Browser wird bereits beendet.');
      const context = browser.contexts()[0];
      if (!context) throw new Error('Browserkontext fehlt.');
      let page = context.pages()[0];
      if (!page || this.requestsSinceTabChange >= 15 || this.recycleAfterFailure) {
        try {
          // Erst Ersatz öffnen, damit Chrome beim letzten geschlossenen Tab weiterläuft.
          const replacement = await abortableBrowserOperation(context.newPage(), signal, (late) =>
            new BrowserCleanup().run(() => late.close()),
          );
          for (const previous of context.pages().filter((candidate) => candidate !== replacement))
            await abortableBrowserOperation(previous.close(), signal);
          page = replacement;
          this.requestsSinceTabChange = 0;
          this.recycleAfterFailure = false;
          this.catalogReady = false;
        } catch (error) {
          // Ungeklärte alte Tabs nicht durch immer neue Ersatz-Tabs vermehren.
          this.unresponsive = true;
          throw error;
        }
      }
      signal.throwIfAborted();
      if (url.pathname === '/catalog' && this.catalogReady) {
        const response = await readCatalogResponse(page, url, signal, cleanup);
        if (response) {
          this.catalogReady = await this.validCatalogResponse(response);
          signal.throwIfAborted();
          this.requestsSinceTabChange++;
          return response;
        }
        this.catalogReady = false;
      }
      const session = await abortableBrowserOperation(context.newCDPSession(page), signal, (late) =>
        new BrowserCleanup().run(() => late.detach()),
      );
      try {
        const response = await readBrowserDocument(
          session,
          url,
          signal,
          cleanup,
          this.requestTimeoutMs,
        );
        this.catalogReady =
          url.pathname === '/catalog' && (await this.validCatalogResponse(response));
        if (this.catalogReady) {
          const control = await abortableBrowserOperation(
            session.send('Runtime.evaluate', {
              expression: 'Boolean(navigator.serviceWorker?.controller)',
              returnByValue: true,
            }),
            signal,
          );
          if (control.result.type !== 'boolean' || control.result.value !== false)
            throw new VintedNetworkError(
              'Ein Service Worker verhindert den direkten Katalogabruf.',
            );
          if (new URL(page.url()).origin !== url.origin)
            throw new VintedNetworkError(
              'Der Browser befindet sich nicht auf der Katalogherkunft.',
            );
        }
        signal.throwIfAborted();
        this.requestsSinceTabChange++;
        return response;
      } finally {
        await cleanup.run(() => session.detach());
      }
    } catch (error) {
      this.recycleAfterFailure = true;
      this.catalogReady = false;
      if (!browser && !signal.aborted) this.unresponsive = true;
      if (timeout.aborted && !init?.signal?.aborted) throw new VintedTimeoutError();
      throw error;
    } finally {
      if (browser) {
        const connection = browser;
        await cleanup.run(() => connection.close());
      }
      if (cleanup.expired) this.unresponsive = true;
    }
  }

  private async validCatalogResponse(response: Response): Promise<boolean> {
    if (!response.ok || response.headers.get('cf-mitigated') === 'challenge') return false;
    const body = await response.clone().text();
    return !body.includes('challenge-running') && !body.includes('<title>Just a moment...</title>');
  }

  async openManual(url: URL): Promise<void> {
    this.validateUrl(url);
    await this.runtime.start();
    await this.stopManual();
    this.manual = true;
    this.catalogReady = false;
    await this.runtime.execute([
      '/usr/bin/google-chrome-stable',
      `--user-data-dir=${this.runtime.options.profileDir}`,
      `--app=${url.href}`,
    ]);
  }

  async stopManual(): Promise<void> {
    await this.runtime.start();
    const browser = await chromium.connectOverCDP(this.runtime.endpoint, {
      noDefaults: true,
      timeout: 5000,
    });
    try {
      const context = browser.contexts()[0];
      if (!context) throw new Error('Browserkontext fehlt.');
      const pages = context.pages();
      const page = pages[0] ?? (await context.newPage());
      for (const other of pages.slice(1)) await other.close();
      const session = await context.newCDPSession(page);
      try {
        await session.send('Network.setBypassServiceWorker', { bypass: false });
        await session.send('Network.setCacheDisabled', { cacheDisabled: false });
        await page.goto('about:blank', { timeout: 5000 });
      } finally {
        await session.detach();
      }
      this.requestsSinceTabChange = 0;
      this.catalogReady = false;
      this.recycleAfterFailure = false;
      this.manual = false;
    } finally {
      await browser.close();
    }
  }

  async captureFrame(): Promise<Uint8Array> {
    if (!this.manual) throw new Error('Keine manuelle Botsitzung geöffnet.');
    return this.desktop.capture();
  }

  async input(command: BrowserInput): Promise<void> {
    if (!this.manual) throw new Error('Keine manuelle Botsitzung geöffnet.');
    await this.desktop.input(command);
  }

  async close(): Promise<void> {
    this.unresponsive = true;
    this.closing ??= this.closeRuntime();
    await this.closing;
  }

  private async closeRuntime(): Promise<void> {
    try {
      if (this.runtime.isReady) {
        const browser = await chromium.connectOverCDP(this.runtime.endpoint, {
          noDefaults: true,
          timeout: 5000,
        });
        const cleanup = new BrowserCleanup();
        await cleanup.run(async () => {
          const session = await browser.newBrowserCDPSession();
          if (!cleanup.expired) await session.send('Browser.close');
        });
        await cleanup.run(() => browser.close());
      }
    } finally {
      await this.runtime.stop(2000);
    }
  }
}
