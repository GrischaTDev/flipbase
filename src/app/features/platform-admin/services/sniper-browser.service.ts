import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  SniperBrowserError,
  type SniperBrowserInput,
  type SniperBrowserStatus,
} from '../models/sniper-browser.model';

const basePath = '/sniper-browser';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable({ providedIn: 'root' })
export class SniperBrowserService {
  private readonly auth = inject(SupabaseService).client.auth;

  async status(): Promise<SniperBrowserStatus> {
    return this.readStatus(await this.request('/status'));
  }
  async open(): Promise<SniperBrowserStatus> {
    return this.readStatus(await this.request('/sessions', { method: 'POST' }));
  }
  async verify(id: string): Promise<SniperBrowserStatus> {
    return this.readStatus(await this.request(this.sessionPath(id, '/verify'), { method: 'POST' }));
  }
  async close(id: string): Promise<void> {
    await this.request(this.sessionPath(id), { method: 'DELETE' });
  }
  async input(id: string, command: SniperBrowserInput): Promise<void> {
    await this.request(this.sessionPath(id, '/input'), {
      method: 'POST',
      body: JSON.stringify(command),
    });
  }
  async frame(id: string, signal: AbortSignal): Promise<Blob> {
    const response = await this.request(this.sessionPath(id, '/frame'), { signal });
    if (response.headers.get('content-type') !== 'image/jpeg')
      throw new Error('Browserbild nicht verfügbar.');
    const frame = await response.blob();
    if (frame.size < 4 || frame.size > 6 * 1024 * 1024)
      throw new Error('Browserbild ist ungültig.');
    const bytes = new Uint8Array(await frame.arrayBuffer());
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
      throw new Error('Browserbild ist ungültig.');
    return frame;
  }
  private sessionPath(id: string, suffix = ''): string {
    if (!uuidPattern.test(id)) throw new Error('Ungültige Browsersitzung.');
    return `/sessions/${id}${suffix}`;
  }
  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const { data: sessionData, error } = await this.auth.getSession();
    const token = sessionData.session?.access_token;
    if (error || !token) throw new SniperBrowserError(401, 'Bitte melde Dich erneut an.');
    const response = await fetch(`${basePath}${path}`, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(30_000),
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const failure: unknown = await response.json().catch(() => null);
      throw new SniperBrowserError(
        response.status,
        typeof failure === 'object' &&
          failure !== null &&
          'message' in failure &&
          typeof failure.message === 'string'
          ? failure.message
          : 'Die Botsitzung ist gerade nicht verfügbar.',
      );
    }
    return response;
  }
  private async readStatus(response: Response): Promise<SniperBrowserStatus> {
    const status: unknown = await response.json();
    if (
      typeof status !== 'object' ||
      status === null ||
      !('state' in status) ||
      !['ready', 'interaction_required', 'manual', 'unavailable'].includes(String(status.state)) ||
      !('sessionId' in status) ||
      !(
        status.sessionId === null ||
        (typeof status.sessionId === 'string' && uuidPattern.test(status.sessionId))
      ) ||
      !('expiresAt' in status) ||
      !(
        status.expiresAt === null ||
        (typeof status.expiresAt === 'string' && Number.isFinite(Date.parse(status.expiresAt)))
      ) ||
      !('message' in status) ||
      !(status.message === null || typeof status.message === 'string')
    )
      throw new Error('Ungültiger Browserstatus.');
    return status as SniperBrowserStatus;
  }
}
