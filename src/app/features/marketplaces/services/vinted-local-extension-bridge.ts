import { DestroyRef, Injectable, inject, signal } from '@angular/core';

type RequestType =
  | 'FLIPBASE_VINTED_LOCAL_READINESS'
  | 'FLIPBASE_VINTED_LOCAL_RECHECK'
  | 'FLIPBASE_VINTED_LOCAL_PREPARE'
  | 'FLIPBASE_VINTED_LOCAL_BIND'
  | 'FLIPBASE_VINTED_LOCAL_SYNC'
  | 'FLIPBASE_VINTED_LOCAL_INBOX_SYNC'
  | 'FLIPBASE_VINTED_LOCAL_INBOX_DETAIL'
  | 'FLIPBASE_VINTED_LOCAL_MESSAGES_SEND'
  | 'FLIPBASE_VINTED_LOCAL_DISCONNECT';
interface PendingRequest {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export interface VintedLocalAccountStatus {
  readonly boundUsername: string | null;
  readonly boundConnectionId: string;
  readonly expiresAt: string;
  readonly state: 'linked' | 'expired' | 'paused' | 'revoked' | 'unavailable';
}
function parseLocalAccountStatus(candidate: unknown): VintedLocalAccountStatus | null | undefined {
  if (candidate === undefined || candidate === null) return candidate;
  if (typeof candidate !== 'object' || Array.isArray(candidate))
    throw new Error('Ungültiger lokaler Kontostatus');
  const fields = candidate as Record<string, unknown>;
  if (
    Object.keys(fields).length !== 4 ||
    (fields['boundUsername'] !== null &&
      (typeof fields['boundUsername'] !== 'string' ||
        !fields['boundUsername'].trim() ||
        fields['boundUsername'].length > 120 ||
        /\p{Cc}/u.test(fields['boundUsername']))) ||
    typeof fields['boundConnectionId'] !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      fields['boundConnectionId'],
    ) ||
    typeof fields['expiresAt'] !== 'string' ||
    !/^\d{4}-\d\d-\d\dT/.test(fields['expiresAt']) ||
    !Number.isFinite(Date.parse(fields['expiresAt'])) ||
    (fields['state'] !== 'linked' &&
      fields['state'] !== 'expired' &&
      fields['state'] !== 'paused' &&
      fields['state'] !== 'revoked' &&
      fields['state'] !== 'unavailable')
  )
    throw new Error('Ungültiger lokaler Kontostatus');
  return Object.freeze({
    boundUsername: fields['boundUsername'],
    boundConnectionId: fields['boundConnectionId'],
    expiresAt: fields['expiresAt'],
    state: fields['state'],
  });
}

/** Die Brücke transportiert nur öffentliche Freigabedaten, keine Vinted-Sitzung. */
@Injectable()
export class VintedLocalExtensionBridge {
  private readonly pending = new Map<string, PendingRequest>();
  private destroyed = false;
  private installationTimer: ReturnType<typeof setTimeout> | undefined;
  readonly installed = signal(false);
  readonly checkingInstallation = signal(false);
  readonly installationCheckFailed = signal(false);
  readonly localAccount = signal<VintedLocalAccountStatus | null | undefined>(undefined);
  constructor() {
    window.addEventListener('message', this.receive);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.localAccount.set(undefined);
      clearTimeout(this.installationTimer);
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
  checkInstallation(): void {
    if (this.destroyed) return;
    clearTimeout(this.installationTimer);
    this.checkingInstallation.set(true);
    this.installationCheckFailed.set(false);
    this.installationTimer = setTimeout(() => {
      this.installed.set(false);
      this.localAccount.set(undefined);
      this.checkingInstallation.set(false);
      this.installationCheckFailed.set(true);
    }, 3_000);
    window.postMessage({ type: 'FLIPBASE_CHECK_EXTENSION' }, location.origin);
  }
  request(type: RequestType, payload?: unknown): Promise<unknown> {
    if (this.destroyed)
      return Promise.reject(new Error('Die Verbindungsansicht wurde geschlossen.'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new Error(
            'Die Erweiterung hat nicht geantwortet. Prüfe, ob der lokale Pilot installiert und Vinted in diesem Browserprofil geöffnet ist.',
          ),
        );
      }, 60_000);
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
    if (response['type'] === 'FLIPBASE_EXTENSION_STATUS') {
      if (response['installed'] === false && response['vintedLocal'] === false) {
        this.installed.set(false);
        this.localAccount.set(undefined);
        return;
      }
      if (response['installed'] === true && response['vintedLocal'] === true) {
        let localAccount: VintedLocalAccountStatus | null | undefined;
        try {
          localAccount = parseLocalAccountStatus(response['localAccount']);
        } catch {
          return;
        }
        clearTimeout(this.installationTimer);
        this.localAccount.set(localAccount);
        this.installed.set(true);
        this.checkingInstallation.set(false);
        this.installationCheckFailed.set(false);
      }
      return;
    }
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
