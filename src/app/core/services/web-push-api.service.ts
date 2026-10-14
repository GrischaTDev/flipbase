import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';
import {
  WebPushCategory,
  WebPushRegistration,
  WebPushServerSettings,
  isPushIdentifier,
} from '../models/web-push.models';

@Injectable({ providedIn: 'root' })
export class WebPushApiService {
  private readonly supabase = inject(SupabaseService);

  private async request(payload: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.supabase.client.functions.invoke('push-settings', {
      body: { ...payload, apiVersion: 2 },
    });
    if (error)
      throw new Error(
        'Die Push-Einstellung konnte nicht bestätigt werden. Bitte versuche es erneut.',
      );
    return data;
  }
  async loadSettings(installationId: string, workspaceId?: string): Promise<WebPushServerSettings> {
    const response = await this.request({
      action: 'settings',
      installationId,
      ...(workspaceId ? { workspaceId } : {}),
    });
    if (!response || typeof response !== 'object') throw new Error('Ungültige Push-Einstellungen.');
    const settings = response as WebPushServerSettings;
    const validCategories = (categories: unknown): categories is WebPushCategory[] =>
      Array.isArray(categories) &&
      categories.every((category) =>
        ['message', 'order', 'favorite', 'connection'].includes(category),
      );
    if (
      typeof settings.enabled !== 'boolean' ||
      typeof settings.publicKey !== 'string' ||
      typeof settings.keyId !== 'string' ||
      !validCategories(settings.allowedCategories) ||
      !Array.isArray(settings.preferences) ||
      settings.preferences.some(
        (preference) =>
          !isPushIdentifier(preference.workspaceId) || !validCategories(preference.categories),
      ) ||
      (settings.binding !== null &&
        (!settings.binding ||
          !isPushIdentifier(settings.binding.deviceId) ||
          typeof settings.binding.active !== 'boolean' ||
          typeof settings.binding.keyId !== 'string'))
    )
      throw new Error('Ungültige Push-Einstellungen.');
    return settings;
  }
  async register(
    registration: WebPushRegistration,
  ): Promise<{ deviceId: string; active: boolean }> {
    const response = await this.request({ action: 'register', ...registration });
    if (!response || typeof response !== 'object') throw new Error('Ungültige Gerätebestätigung.');
    const binding = response as { deviceId: string; active: boolean };
    if (binding.deviceId !== registration.generationId || typeof binding.active !== 'boolean')
      throw new Error('Ungültige Gerätebestätigung.');
    return binding;
  }
  async savePreferences(
    deviceId: string,
    workspaceId: string,
    categories: WebPushCategory[],
  ): Promise<void> {
    const response = await this.request({
      action: 'preferences',
      deviceId,
      workspaceId,
      categories,
    });
    if (!response || typeof response !== 'object')
      throw new Error('Einstellungen wurden nicht bestätigt.');
    const confirmed = response as { deviceId: string; workspaceId: string; categories: unknown };
    if (
      confirmed.deviceId !== deviceId ||
      confirmed.workspaceId !== workspaceId ||
      !Array.isArray(confirmed.categories) ||
      [...confirmed.categories].sort().join() !== [...categories].sort().join()
    )
      throw new Error('Einstellungen wurden nicht bestätigt.');
  }
  async revoke(deviceId: string): Promise<void> {
    const response = await this.request({ action: 'revoke', deviceId });
    if (
      !response ||
      typeof response !== 'object' ||
      (response as { active?: unknown }).active !== false ||
      (response as { deviceId?: unknown }).deviceId !== deviceId
    )
      throw new Error('Die Deaktivierung wurde nicht bestätigt.');
  }
  async sendTest(deviceId: string, workspaceId: string): Promise<void> {
    const response = await this.request({ action: 'test', deviceId, workspaceId });
    if (
      !response ||
      typeof response !== 'object' ||
      (response as { status?: unknown }).status !== 'queued' ||
      !isPushIdentifier((response as { eventId?: unknown }).eventId)
    )
      throw new Error('Der Test wurde nicht zur Zustellung angenommen.');
  }
  async revokeBinding(generationId: string, token: string): Promise<void> {
    const response = await fetch(`${environment.supabaseUrl}/functions/v1/push-revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: environment.supabaseAnonKey },
      body: JSON.stringify({ action: 'revoke_binding', generationId, token }),
      signal: AbortSignal.timeout(10000),
      credentials: 'omit',
      redirect: 'error',
    });
    if (!response.ok || ((await response.json()) as { revoked?: unknown }).revoked !== true)
      throw new Error('Der Serverwiderruf ist noch ausstehend.');
  }
}
