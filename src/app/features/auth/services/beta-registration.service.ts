import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';

@Injectable({ providedIn: 'root' })
export class BetaRegistrationService {
  private readonly supabase = inject(SupabaseService);

  async inspect(token: string): Promise<void> {
    await this.invoke({ action: 'inspect', token });
  }

  async complete(token: string, password: string, requestId: string): Promise<void> {
    const data = await this.invoke({
      action: 'complete',
      token,
      password,
      requestId,
      acceptedTerms: true,
    });
    const session = data['session'] as { access_token: string; refresh_token: string } | undefined;
    if (!session?.access_token || !session.refresh_token)
      throw new Error('Bitte melde Dich mit Deinem neuen Passwort an.');
    const { error } = await this.supabase.client.auth.setSession(session);
    if (error) throw new Error(error.message);
  }

  private async invoke(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await this.supabase.client.functions.invoke('beta-register', { body });
    if (error || !data || data.error)
      throw new Error(
        'Der Registrierungslink ist ungültig oder abgelaufen. Falls Du Dein Passwort bereits gespeichert hast, melde Dich damit an.',
      );
    return data as Record<string, unknown>;
  }
}
