import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { VintedAiModel, VintedAiResult, VintedAiUsageSummary } from '../models/vinted-ai-search';

@Injectable({ providedIn: 'root' })
export class VintedAiSearchService {
  private readonly supabase = inject(SupabaseService);

  async search(
    workspaceId: string,
    listingId: string,
    model: VintedAiModel,
  ): Promise<VintedAiResult> {
    return this.invoke<VintedAiResult>({ workspaceId, listingId, model });
  }

  async usage(workspaceId: string): Promise<VintedAiUsageSummary[]> {
    return (await this.invoke<{ stats: VintedAiUsageSummary[] }>({ workspaceId, action: 'usage' }))
      .stats;
  }

  private async invoke<T>(body: Record<string, string>): Promise<T> {
    const { data, error } = await this.supabase.client.functions.invoke<T>('vinted-ai-search', {
      body,
      ...(body['action'] === 'usage' ? {} : { timeout: 155_000 }),
    });
    if (error) {
      let code: unknown;
      if (error.context instanceof Response) {
        const response: unknown = await error.context
          .clone()
          .json()
          .catch(() => null);
        code =
          response && typeof response === 'object' && 'error' in response ? response.error : null;
      }
      const messages: Record<string, string> = {
        forbidden:
          'Diese Suche ist nur für Admins mit Zugriff auf diesen Arbeitsbereich verfügbar.',
        not_configured: 'Der serverseitige OpenAI-Zugang ist nicht verfügbar.',
        search_busy: 'Eine Analyse läuft bereits. Bitte warte auf deren Abschluss.',
        search_limit: 'Das Admin-Limit ist erreicht (20 Analysen pro Stunde, 100 pro Tag).',
        listing_not_found: 'Dieser Artikel ist im Feed nicht mehr verfügbar.',
        unsupported_currency: 'Die Preisbewertung unterstützt derzeit nur Euro-Artikel.',
        tracking_unavailable:
          'Die Verbrauchserfassung ist nicht verfügbar. Bitte prüfe den Verlauf vor einem erneuten Versuch.',
        analysis_incomplete:
          'Die KI hat kein vollständiges Ergebnis geliefert. Der gemeldete Verbrauch wurde trotzdem erfasst.',
      };
      throw new Error(
        typeof code === 'string' && messages[code]
          ? messages[code]
          : 'Die KI-Suche ist gerade nicht verfügbar. Bereits entstandene Kosten können angefallen sein.',
      );
    }
    if (!data) throw new Error('Die KI-Suche hat keine Antwort geliefert.');
    return data;
  }
}
