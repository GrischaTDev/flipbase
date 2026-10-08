import assert from 'node:assert/strict';
import { readLimitedJsonBody, RequestBodyTooLargeError } from './limited-request-body.ts';

Deno.test(
  'Chunked und falsch deklarierte Requests zählen tatsächliche Bytes und stoppen den Stream',
  async () => {
    for (const contentLength of [undefined, '1']) {
      let canceled = false;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(4));
          controller.enqueue(new Uint8Array(5));
        },
        cancel() {
          canceled = true;
        },
      });
      const request = new Request('https://test.invalid', {
        method: 'POST',
        body: stream,
        headers: contentLength ? { 'Content-Length': contentLength } : {},
      });
      await assert.rejects(readLimitedJsonBody(request, 8), RequestBodyTooLargeError);
      assert.equal(canceled, true);
    }
  },
);
Deno.test(
  'UTF-8-Bytegrenze erhält vollständiges JSON und weist übergroße Unicode-Bodies ab',
  async () => {
    const body = JSON.stringify({ title: 'ä🙂' });
    const bytes = new TextEncoder().encode(body).length;
    const request = () => new Request('https://test.invalid', { method: 'POST', body });
    assert.deepEqual(await readLimitedJsonBody(request(), bytes), { title: 'ä🙂' });
    await assert.rejects(readLimitedJsonBody(request(), bytes - 1), RequestBodyTooLargeError);
    await assert.rejects(
      readLimitedJsonBody(new Request('https://test.invalid', { method: 'POST', body: '{' }), 8),
    );
  },
);
