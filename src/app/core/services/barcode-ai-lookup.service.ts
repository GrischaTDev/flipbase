import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { normalizeGtin } from '../../shared/utils/gtin';

export interface BarcodeAiCandidate {
  title: string;
  brand: string;
  model: string;
  size: string;
  color: string;
  category: string;
  sourceUrl: string;
  confidence: 'exact' | 'likely' | 'weak';
  evidence: string;
}

export interface BarcodeAiLabelSuggestion {
  title: string;
  brand: string;
  model: string;
  size: string;
  color: string;
  category: string;
  articleNumber: string;
}

export interface BarcodeAiResult {
  candidates: BarcodeAiCandidate[];
  labelSuggestion?: BarcodeAiLabelSuggestion | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    webSearchCalls: number;
    estimatedCostUsd: number;
  };
}

@Injectable({ providedIn: 'root' })
export class BarcodeAiLookupService {
  private readonly supabase = inject(SupabaseService);
  readonly sessionUsage = signal({ searches: 0, estimatedCostUsd: 0 });

  async search(eanValue: string, labelPhoto: File | null): Promise<BarcodeAiResult> {
    const ean = normalizeGtin(eanValue);
    if (!ean) throw new Error('Bitte zuerst eine gültige EAN scannen oder eingeben.');
    let imageDataUrl: string | null = null;
    if (labelPhoto) {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(labelPhoto.type) ||
        labelPhoto.size > 5_000_000
      ) {
        throw new Error('Bitte ein JPG-, PNG- oder WebP-Foto unter 5 MB auswählen.');
      }
      imageDataUrl = await this.readImage(labelPhoto);
    }
    const { data, error } = await this.supabase.client.functions.invoke<BarcodeAiResult>(
      'barcode-ai-search',
      { body: { ean, imageDataUrl } },
    );
    if (error) {
      if (error.context instanceof Response) {
        const body: unknown = await error.context
          .clone()
          .json()
          .catch(() => null);
        if (
          typeof body === 'object' &&
          body !== null &&
          'error' in body &&
          body.error === 'not_configured'
        ) {
          throw new Error('Der OpenAI-Zugang ist in Supabase noch nicht eingerichtet.');
        }
      }
      throw new Error('Die KI-Suche ist gerade nicht verfügbar.');
    }
    if (!data) throw new Error('Die KI-Suche hat keine Antwort geliefert.');
    this.sessionUsage.update((current) => ({
      searches: current.searches + 1,
      estimatedCostUsd: current.estimatedCostUsd + data.usage.estimatedCostUsd,
    }));
    return data;
  }

  private readImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Das Etikettfoto konnte nicht gelesen werden.'));
      };
      reader.onerror = () => reject(new Error('Das Etikettfoto konnte nicht gelesen werden.'));
      reader.readAsDataURL(file);
    });
  }
}
