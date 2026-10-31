import type { Page } from 'playwright';

/** Liest nur die Antwort des echten Formularaufrufs, bevor Vinteds Weiterleitung sie entfernt. */
export async function observeVintedListingCreation(page: Page, timeout: number) {
  const session = await page.context().newCDPSession(page);
  let finish: (id: string | null) => void = () => undefined;
  const result = new Promise<string | null>((resolve) => {
    finish = resolve;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { frameTree } = await session.send('Page.getFrameTree');
    session.on('Fetch.requestPaused', async (event) => {
      const request = event.request;
      const matches =
        event.frameId === frameTree.frame.id &&
        request.url === 'https://www.vinted.de/api/v2/item_upload/items' &&
        request.method === 'POST' &&
        Object.entries(request.headers).some(
          ([key, value]) => key.toLowerCase() === 'x-upload-form' && value === 'true',
        );
      let id: string | null = null;
      try {
        if (
          matches &&
          event.responseStatusCode &&
          event.responseStatusCode >= 200 &&
          event.responseStatusCode < 300 &&
          !event.responseErrorReason &&
          event.responseHeaders?.some(
            (header) =>
              header.name.toLowerCase() === 'content-type' &&
              /^application\/json(?:\s*;|$)/i.test(header.value),
          )
        ) {
          const response = await session.send('Fetch.getResponseBody', {
            requestId: event.requestId,
          });
          const text = response.base64Encoded
            ? Buffer.from(response.body, 'base64').toString('utf8')
            : response.body;
          if (text.length <= 1_048_576) {
            const body: unknown = JSON.parse(text);
            const item = body && typeof body === 'object' && 'item' in body ? body.item : null;
            const value = item && typeof item === 'object' && 'id' in item ? item.id : null;
            const candidate =
              typeof value === 'string'
                ? value
                : typeof value === 'number' && Number.isSafeInteger(value)
                  ? String(value)
                  : '';
            if (/^[1-9][0-9]{0,31}$/.test(candidate)) id = candidate;
          }
        }
      } catch {
        // Keine Antwortdaten oder native Fehlermeldungen nach außen übernehmen.
      } finally {
        try {
          // Dieselbe Antwort unverändert weiterreichen; kein eigener Schreibaufruf oder Retry.
          await session.send('Fetch.continueResponse', { requestId: event.requestId });
        } catch {
          id = null;
        }
        if (matches) finish(id);
      }
    });
    await session.send('Fetch.enable', {
      patterns: [
        { urlPattern: 'https://www.vinted.de/api/v2/item_upload/items', requestStage: 'Response' },
      ],
    });
    timer = setTimeout(() => finish(null), timeout);
    return {
      result,
      close: async () => {
        clearTimeout(timer);
        finish(null);
        await session.send('Fetch.disable').catch(() => undefined);
        await session.detach().catch(() => undefined);
      },
    };
  } catch (error) {
    await session.detach().catch(() => undefined);
    throw error;
  }
}
