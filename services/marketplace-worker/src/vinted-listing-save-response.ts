import type { Page } from 'playwright';

/**
 * Vinteds eigene Antwort auf das Speichern eines bestehenden Inserats. `saved` enthält das
 * gespeicherte Inserat so, wie Vinted es zurückgibt; `rejected` heißt, dass Vinted den
 * Speicheraufruf mit einem Fehlerstatus beantwortet hat.
 */
export type VintedListingSaveResponse =
  { outcome: 'saved'; item: unknown } | { outcome: 'rejected'; httpStatus: number };

export interface VintedListingSaveObserver {
  /** Löst mit der ersten passenden Antwort auf, sonst nach Ablauf der Frist mit `null`. */
  result: Promise<VintedListingSaveResponse | null>;
  close: () => Promise<void>;
}

const writeMethods = new Set(['PUT', 'PATCH', 'POST']);

/**
 * Liest die Antwort des echten Speicheraufrufs der Bearbeitungsmaske mit, ohne sie zu verändern
 * oder selbst etwas zu senden. Lesende Abfragen derselben Adresse werden unverändert durchgereicht.
 * Bleibt die Antwort aus, entscheidet weiterhin das Nachlesen; ein fehlender Beleg ist keine Ablehnung.
 */
export async function observeVintedListingSave(
  page: Page,
  itemId: string,
  timeoutMs: number,
): Promise<VintedListingSaveObserver> {
  if (!/^[1-9][0-9]{0,31}$/.test(itemId)) throw new Error('Ungültige Inseratkennung.');
  const target = 'https://www.vinted.de/api/v2/item_upload/items/' + itemId;
  const session = await page.context().newCDPSession(page);
  let finish: (value: VintedListingSaveResponse | null) => void = () => undefined;
  const result = new Promise<VintedListingSaveResponse | null>((resolve) => {
    finish = resolve;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { frameTree } = await session.send('Page.getFrameTree');
    session.on('Fetch.requestPaused', async (event) => {
      const request = event.request;
      const url = request.url.split('?')[0];
      const matches =
        event.frameId === frameTree.frame.id &&
        url === target &&
        writeMethods.has(request.method.toUpperCase());
      let observed: VintedListingSaveResponse | null = null;
      try {
        const status = event.responseStatusCode ?? 0;
        if (matches && !event.responseErrorReason && status >= 400 && status < 500)
          observed = { outcome: 'rejected', httpStatus: status };
        else if (
          matches &&
          !event.responseErrorReason &&
          status >= 200 &&
          status < 300 &&
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
            if (item && typeof item === 'object') observed = { outcome: 'saved', item };
          }
        }
      } catch {
        // Keine Antwortdaten oder native Fehlermeldungen nach außen übernehmen.
        observed = null;
      } finally {
        try {
          // Dieselbe Antwort unverändert weiterreichen; kein eigener Schreibaufruf oder Retry.
          await session.send('Fetch.continueResponse', { requestId: event.requestId });
        } catch {
          // Die Seite erhält die Antwort dann nicht; der Beleg bleibt trotzdem gültig.
        }
        if (matches && observed) finish(observed);
      }
    });
    await session.send('Fetch.enable', {
      patterns: [{ urlPattern: target + '*', requestStage: 'Response' }],
    });
    timer = setTimeout(() => finish(null), timeoutMs);
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
