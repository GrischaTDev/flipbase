import { Database } from '../../../core/models/supabase.types';

export type SniperQuery = Database['public']['Tables']['sniper_queries']['Row'];
export type SniperRuntimeStatus = Database['public']['Tables']['sniper_runtime_status']['Row'];

export function formatBotUptime(totalSeconds: number): string {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':');
}

export interface QueryDraft {
  id: string | null;
  title: string;
  brandId: number | null;
  intervalSeconds: number;
  notes: string;
}

export function queryDraftError(draft: QueryDraft): string | null {
  if (!draft.title.trim()) return 'Bitte einen Filtername angeben.';
  if (draft.title.length > 100) return 'Der Filtername darf höchstens 100 Zeichen lang sein.';
  if (
    draft.brandId === null ||
    !Number.isInteger(draft.brandId) ||
    draft.brandId < 1 ||
    draft.brandId > 2147483647
  )
    return 'Bitte eine gültige Markenkennung angeben.';
  if (draft.notes.length > 2000) return 'Die Notiz darf höchstens 2.000 Zeichen lang sein.';
  if (
    !Number.isInteger(draft.intervalSeconds) ||
    draft.intervalSeconds < 10 ||
    draft.intervalSeconds > 86400
  )
    return 'Der Takt muss zwischen 10 und 86.400 Sekunden liegen.';
  return null;
}

export function queryStatusLabel(query: SniperQuery): string {
  const status = {
    never_polled: 'Noch nicht abgefragt',
    ok: 'Erfolgreich',
    rate_limited: 'Anfragelimit erreicht',
    forbidden: 'Zugriff abgewiesen',
    failed: 'Abfrage fehlgeschlagen',
  };
  return status[query.last_status as keyof typeof status] ?? query.last_status;
}
