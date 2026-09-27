import { Injectable } from '@angular/core';
import type { AccountScope } from '../models/marketplace.models';

export type BrowserTestInput =
  | { kind: 'click'; x: number; y: number }
  | { kind: 'type'; value: string }
  | { kind: 'press'; key: 'Enter' | 'Tab' | 'Escape' | 'Backspace' };

export interface BrowserTestAvailability {
  available: boolean;
  readOnly: boolean;
}

export class BrowserTestSessionEndedError extends Error {
  constructor() {
    super('Browsersitzung wurde beendet');
  }
}

const basePath = '/marketplace-browser/sessions';
const frameLimit = 512 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable({ providedIn: 'root' })
export class MarketplaceBrowserTestApiService {
  async available(): Promise<BrowserTestAvailability> {
    try {
      const response = await fetch('/marketplace-browser/healthz', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
        return { available: false, readOnly: true };
      const body: unknown = await response.json();
      if (
        typeof body === 'object' &&
        body !== null &&
        'ok' in body &&
        body.ok === true &&
        'readOnly' in body &&
        typeof body.readOnly === 'boolean'
      )
        return { available: true, readOnly: body.readOnly };
      return { available: false, readOnly: true };
    } catch {
      return { available: false, readOnly: true };
    }
  }

  async open(scope: AccountScope, accessToken: string): Promise<string> {
    const response = await this.post(basePath, scope, accessToken);
    if (response.status !== 201) throw new Error('Browsersitzung nicht verfügbar');
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('id' in body) ||
      typeof body.id !== 'string' ||
      !uuidPattern.test(body.id)
    )
      throw new Error('Ungültige Browsersitzung');
    return body.id;
  }

  async frame(scope: AccountScope, sessionId: string, accessToken: string): Promise<Blob> {
    const response = await this.post(`${basePath}/${sessionId}/frame`, scope, accessToken);
    if (response.status === 410) throw new BrowserTestSessionEndedError();
    if (!response.ok || response.headers.get('content-type') !== 'image/jpeg')
      throw new Error('Browserbild nicht verfügbar');
    const blob = await response.blob();
    if (blob.size < 4 || blob.size > frameLimit) throw new Error('Browserbild ist ungültig');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff ||
      bytes[bytes.length - 1] !== 0xd9
    )
      throw new Error('Browserbild ist ungültig');
    return blob;
  }

  async input(
    scope: AccountScope,
    sessionId: string,
    input: BrowserTestInput,
    accessToken: string,
  ): Promise<void> {
    const response = await this.post(
      `${basePath}/${sessionId}/input`,
      { ...scope, input },
      accessToken,
    );
    if (response.status === 410) throw new BrowserTestSessionEndedError();
    if (!response.ok) throw new Error('Eingabe konnte nicht bestätigt werden');
  }

  async close(scope: AccountScope, sessionId: string, accessToken: string): Promise<void> {
    const response = await this.post(`${basePath}/${sessionId}/close`, scope, accessToken);
    if (response.status !== 204) throw new Error('Browser-Stopp konnte nicht bestätigt werden');
  }

  private post(path: string, body: unknown, accessToken: string): Promise<Response> {
    return fetch(path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'same-origin',
    });
  }
}
