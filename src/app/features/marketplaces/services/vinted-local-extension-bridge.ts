import { DestroyRef, Injectable, inject } from '@angular/core';

type RequestType =
  | 'FLIPBASE_VINTED_LOCAL_PREPARE'
  | 'FLIPBASE_VINTED_LOCAL_BIND'
  | 'FLIPBASE_VINTED_LOCAL_SYNC'
  | 'FLIPBASE_VINTED_LOCAL_DISCONNECT';
interface PendingRequest {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Die Brücke transportiert nur öffentliche Freigabedaten, keine Vinted-Sitzung. */
@Injectable()
export class VintedLocalExtensionBridge {
  private readonly pending = new Map<string, PendingRequest>();
  private destroyed = false;
  constructor() {
    window.addEventListener('message', this.receive);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      window.removeEventListener('message', this.receive);
      this.cancel();
    });
  }
  cancel(): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Die lokale Verbindungsansicht wurde geschlossen oder gewechselt.'));
    }
    this.pending.clear();
  }
  request(type: RequestType, payload?: unknown): Promise<unknown> {
    if (this.destroyed)
      return Promise.reject(new Error('Die Verbindungsansicht wurde geschlossen.'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(requestId);
          reject(
            new Error(
              'Die Erweiterung hat nicht geantwortet. Prüfe, ob der lokale Pilot installiert und Vinted in diesem Browserprofil geöffnet ist.',
            ),
          );
        },
        type === 'FLIPBASE_VINTED_LOCAL_SYNC' ? 300_000 : 60_000,
      );
      this.pending.set(requestId, { resolve, reject, timer });
      window.postMessage(
        { type, requestId, ...(payload === undefined ? {} : { payload }) },
        location.origin,
      );
    });
  }
  private readonly receive = (event: MessageEvent<unknown>): void => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      !event.data ||
      typeof event.data !== 'object'
    )
      return;
    const response = event.data as Record<string, unknown>;
    if (
      response['type'] !== 'FLIPBASE_VINTED_LOCAL_RESULT' ||
      typeof response['requestId'] !== 'string' ||
      typeof response['success'] !== 'boolean'
    )
      return;
    const request = this.pending.get(response['requestId']);
    if (!request) return;
    clearTimeout(request.timer);
    this.pending.delete(response['requestId']);
    if (response['success']) request.resolve(response['result']);
    else
      request.reject(
        new Error(
          typeof response['error'] === 'string' && response['error'].length <= 500
            ? response['error']
            : 'Die Erweiterung konnte die Anfrage nicht bestätigen.',
        ),
      );
  };
}
