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

    return (data ?? []).map((row) => ({
      id: row.id as string,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      email: row.email as string,
      status: row.status as BetaApplicationStatus,
      grantedDays: (row.granted_days as number | null) ?? null,
      decisionNote: (row.decision_note as string | null) ?? null,
      createdAt: row.created_at as string,
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
