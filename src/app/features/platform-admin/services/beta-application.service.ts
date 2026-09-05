import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { BetaApplication, BetaApplicationStatus } from '../models/beta-application.model';

/**
 * Laedt Bewerbungen und schreibt Entscheidungen.
 *
 * Angelegt wird hier nichts: Bewerbungen entstehen ausschliesslich in der Edge
 * Function, und die Tabelle hat fuer angemeldete Nutzer keine Insert-Regel.
 */
@Injectable({ providedIn: 'root' })
export class BetaApplicationService {
  private readonly supabase = inject(SupabaseService);

  async list(): Promise<BetaApplication[]> {
    const { data, error } = await this.supabase.client
      .from('beta_applications')
      .select('id, first_name, last_name, email, status, granted_days, decision_note, created_at')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((zeile) => ({
      id: zeile.id as string,
      firstName: zeile.first_name as string,
      lastName: zeile.last_name as string,
      email: zeile.email as string,
      status: zeile.status as BetaApplicationStatus,
      grantedDays: (zeile.granted_days as number | null) ?? null,
      decisionNote: (zeile.decision_note as string | null) ?? null,
      createdAt: zeile.created_at as string,
    }));
  }

  async decide(
    id: string,
    status: Exclude<BetaApplicationStatus, 'open'>,
    grantedDays: number | null,
    note: string | null,
  ): Promise<void> {
    const { error } = await this.supabase.client
      .from('beta_applications')
      // decided_by und decided_at setzt ein Trigger in der Datenbank. Vom
      // Browser gesetzt waeren beide fälschbar.
      .update({ status, granted_days: grantedDays, decision_note: note })
      .eq('id', id);

    if (error) throw new Error(error.message);
  }
}
