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
  processedPhotoCount?: number;
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

  async search(
    eanValue: string,
    selectedPhotos: File | readonly File[] | null,
  ): Promise<BarcodeAiResult> {
    const enteredEan = eanValue.trim();
    const ean = enteredEan ? normalizeGtin(enteredEan) : '';
    const photos =
      selectedPhotos === null
        ? []
        : Array.isArray(selectedPhotos)
          ? selectedPhotos
          : [selectedPhotos];
    if (ean === null) throw new Error('Bitte eine gültige EAN eingeben oder die EAN entfernen.');
    if (!ean && photos.length === 0)
      throw new Error('Bitte eine EAN eingeben oder mindestens ein Produktfoto auswählen.');
    if (photos.length > 5) throw new Error('Bitte höchstens fünf Fotos auswählen.');
    if (photos.reduce((total, photo) => total + photo.size, 0) > 15_000_000)
      throw new Error('Alle Fotos zusammen dürfen höchstens 15 MB groß sein.');
    for (const photo of photos) {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) ||
        photo.size > 5_000_000
      ) {
        throw new Error('Bitte JPG-, PNG- oder WebP-Fotos unter je 5 MB auswählen.');
      }
    }
    const imageDataUrls = await Promise.all(photos.map((photo) => this.readImage(photo)));
    const { data, error } = await this.supabase.client.functions.invoke<BarcodeAiResult>(
      'barcode-ai-search',
      // Die bereits ausgerollte Funktion liest nur imageDataUrl. Die aktuelle
      // Funktion fuegt additionalImageDataUrls hinzu, ohne das erste Foto
      // doppelt in der Anfrage zu uebertragen.
      {
        body: {
          ean,
          imageDataUrl: imageDataUrls[0] ?? null,
          additionalImageDataUrls: imageDataUrls.slice(1),
        },
      },
    );
    if (error) {
      if (error.context instanceof Response) {
        const body: unknown = await error.context
          .clone()
          .json()
          .catch(() => null);
        const errorCode =
          typeof body === 'object' && body !== null && 'error' in body ? body.error : null;
        if (errorCode === 'not_configured') {
          throw new Error('Der OpenAI-Zugang ist in Supabase noch nicht eingerichtet.');
        }
        if (errorCode === 'invalid_input')
          throw new Error(
            'Die Serverfunktion hat die Fotos abgelehnt. Bitte prüfe Format und Größe.',
          );
        if (error.context.status === 413)
          throw new Error(
            'Die Fotos sind für die Übertragung zu groß. Bitte wähle kleinere Bilder.',
          );
      }
      throw new Error('Die KI-Suche ist gerade nicht verfügbar.');
    }
    if (!data) throw new Error('Die KI-Suche hat keine Antwort geliefert.');
    // Eine ältere Serverfassung liefert keine Anzahl und verarbeitet nur
    // imageDataUrl. Der Dialog kann dann sichtbar auf die Einschränkung hinweisen.
    const result = {
      ...data,
      processedPhotoCount: data.processedPhotoCount ?? Math.min(photos.length, 1),
    };
    this.sessionUsage.update((current) => ({
      searches: current.searches + 1,
      estimatedCostUsd: current.estimatedCostUsd + result.usage.estimatedCostUsd,
    }));
    return result;
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
