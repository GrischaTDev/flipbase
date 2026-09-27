import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';

export interface BetaDiscordStatus {
  eligible: boolean;
  linked: boolean;
  configured: boolean;
  guildId: string | null;
}

@Injectable({ providedIn: 'root' })
export class BetaDiscordService {
  private readonly supabase = inject(SupabaseService);

  async status(): Promise<BetaDiscordStatus> {
    const { data, error } = await this.supabase.client.functions.invoke<BetaDiscordStatus>(
      'beta-discord',
      { body: { action: 'status' } },
    );
    if (error || !data) throw new Error('Discord-Status konnte nicht geladen werden.');
    return data;
  }

  async authorizationUrl(): Promise<string> {
    const { data, error } = await this.supabase.client.functions.invoke<{
      authorizationUrl: string;
    }>('beta-discord', { body: { action: 'authorize' } });
    if (error || !data?.authorizationUrl) {
      throw new Error('Discord-Verbindung konnte nicht gestartet werden.');
    }
    const url = new URL(data.authorizationUrl);
    if (url.origin !== 'https://discord.com' || url.pathname !== '/oauth2/authorize') {
      throw new Error('Discord-Adresse ist ungültig.');
    }
    return url.toString();
  }

  async complete(code: string, state: string): Promise<void> {
    const { data, error } = await this.supabase.client.functions.invoke<{ linked: boolean }>(
      'beta-discord',
      { body: { action: 'complete', code, state } },
    );
    if (error || !data?.linked)
      throw new Error('Discord-Verbindung konnte nicht abgeschlossen werden.');
  }
}
