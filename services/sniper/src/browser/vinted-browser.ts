import { chromium, type CDPSession } from 'playwright';
import type { BrowserInput } from './browser-types.js';
import { BrowserDesktop } from './browser-desktop.js';
import { ChromeProcess, type ChromeProcessOptions } from './chrome-process.js';

interface PausedRequest {
  requestId: string;
  resourceType: string;
  request: { url: string };
  responseStatusCode?: number;
  responseErrorReason?: string;
  responseHeaders?: { name: string; value: string }[];
}

export async function readBrowserDocument(
  session: CDPSession,
  url: URL,
  signal?: AbortSignal,
): Promise<Response> {
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(20_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let settled = false;
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
  const processPaused = async (event: PausedRequest) => {
    pausedRequests.add(event.requestId);
    if (settled || event.resourceType !== 'Document' || event.request.url !== url.href) {
      await session.send('Fetch.failRequest', {
        requestId: event.requestId,
        errorReason: 'Aborted',
      });
      pausedRequests.delete(event.requestId);
      return;
    }
    if (event.responseStatusCode === undefined) {
      if (event.responseErrorReason) throw new Error('Browserabruf fehlgeschlagen.');
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
        await session.send('IO.close', { handle: stream });
      }
    }
    requestSignal.throwIfAborted();
    // Der Browser behält Cookies, führt aber weder Seitencode noch Weiterleitungen aus.
    await session.send('Fetch.fulfillRequest', {
      requestId: event.requestId,
      responseCode: 200,
      responseHeaders: [
        ...(event.responseHeaders ?? []).filter(
          (header) => header.name.toLowerCase() === 'set-cookie',
        ),
        { name: 'content-type', value: 'text/html' },
        { name: 'cache-control', value: 'no-store' },
      ],
      body: Buffer.from('<!doctype html><title>Flipbase</title>').toString('base64'),
    });
    if (settled) return;
    pausedRequests.delete(event.requestId);
    settled = true;
    resolveResponse(
      new Response([204, 304].includes(status) ? null : Buffer.concat(chunks).toString('utf8'), {
        status,
        headers,
      }),
    );
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
  try {
    await session.send('Network.setBypassServiceWorker', { bypass: true });
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    await session.send('Fetch.enable', {
      patterns: [
        { urlPattern: '*', requestStage: 'Request' },
        { urlPattern: '*', requestStage: 'Response' },
      ],
    });
    requestSignal.throwIfAborted();
    const navigation = await session.send('Page.navigate', { url: url.href });
    if (navigation.errorText && !settled) throw new Error('Browsernavigation fehlgeschlagen.');
    return await response;
  } finally {
    settled = true;
    session.off('Fetch.requestPaused', onPaused);
    requestSignal.removeEventListener('abort', onAbort);
    await session.send('Page.stopLoading').catch(() => undefined);
    for (const requestId of pausedRequests) {
      await session
        .send('Fetch.failRequest', { requestId, errorReason: 'Aborted' })
        .catch(() => undefined);
    }
    await session.send('Fetch.disable').catch(() => undefined);
  }
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

  constructor(
    private readonly baseUrl: string,
    options: ChromeProcessOptions,
  ) {
    this.runtime = new ChromeProcess(options);
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
    if (this.manual) throw new Error('Die Botsitzung wird gerade manuell bedient.');
    const url = this.validateUrl(input);
    init?.signal?.throwIfAborted();
    await this.runtime.start();
    const browser = await chromium.connectOverCDP(this.runtime.endpoint, {
      noDefaults: true,
      timeout: 5000,
    });
    try {
      const context = browser.contexts()[0];
      if (!context) throw new Error('Browserkontext fehlt.');
      const page = context.pages()[0] ?? (await context.newPage());
      const session = await context.newCDPSession(page);
      try {
        return await readBrowserDocument(session, url, init?.signal ?? undefined);
      } finally {
        await session.detach().catch(() => undefined);
      }
    } finally {
      await browser.close();
    }
  }

  async openManual(url: URL): Promise<void> {
    this.validateUrl(url);
    await this.runtime.start();
    await this.stopManual();
    this.manual = true;
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
    await this.runtime.stop();
  }
}
