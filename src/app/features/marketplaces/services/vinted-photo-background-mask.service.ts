import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { ListingImageDraft } from '../../../shared/components/listing-image-editor/listing-image-draft';
import {
  VintedListingPhotoSourceService,
  type VintedListingPhotoScope,
} from './vinted-listing-photo-source.service';

export interface ForegroundPhotoMask {
  readonly base64: string;
  readonly mimeType: 'image/png';
}

interface MaskFunctionResponse {
  readonly maskId: string;
  readonly maskBase64: string;
  readonly maskMimeType: 'image/png';
  readonly cached?: boolean;
}

const MAX_MASK_REQUEST_EDGE = 1600;
const ERROR_MESSAGES: Record<string, string> = {
  not_configured: 'Die KI-Untergrundberuhigung ist serverseitig noch nicht eingerichtet.',
  mask_busy: 'Eine andere Maske wird gerade erstellt. Bitte warte einen Moment.',
  mask_limit: 'Das Limit für KI-Masken ist vorübergehend erreicht.',
  forbidden: 'Du hast keine Berechtigung, Fotos in diesem Arbeitsbereich zu bearbeiten.',
  invalid_image: 'Dieses Fotoformat wird für die KI-Maske nicht unterstützt.',
  provider_timeout: 'Die Maskenerstellung hat zu lange gedauert. Bitte versuche es erneut.',
};

function readBlobAsDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Das Foto konnte nicht gelesen werden.'));
    reader.onerror = () => reject(new Error('Das Foto konnte nicht gelesen werden.'));
    reader.readAsDataURL(blob);
  });
}

function readBlobAsBase64(blob: Blob): Promise<string> {
  return readBlobAsDataUri(blob).then((dataUri) => {
    const index = dataUri.indexOf(',');
    if (index < 0) throw new Error('Die Fotomaske ist ungültig.');
    return dataUri.slice(index + 1);
  });
}

/** Fordert serverseitige Vordergrundmasken über BiRefNet an und hält Originale sowie geladene Masken im Cache. */
@Injectable({ providedIn: 'root' })
export class VintedPhotoBackgroundMaskService {
  private readonly supabase = inject(SupabaseService);
  private readonly photos = inject(VintedListingPhotoSourceService);
  private readonly masksById = new Map<string, ForegroundPhotoMask>();
  private readonly sourceToMaskId = new Map<string, string>();
  private readonly inflightLoads = new Map<string, Promise<ForegroundPhotoMask>>();

  cachedMask(maskId: string): ForegroundPhotoMask | null {
    return this.masksById.get(maskId) ?? null;
  }

  async createMask(
    workspaceId: string,
    photo: ListingImageDraft,
    scope?: VintedListingPhotoScope | null,
  ): Promise<{ maskId: string; mask: ForegroundPhotoMask }> {
    const source =
      photo.originalFile ??
      (photo.crop ? null : photo.file) ??
      photo.originalPreviewUrl ??
      photo.previewUrl;
    const sourceKey =
      typeof source === 'string'
        ? `${workspaceId}::url::${source}`
        : `${workspaceId}::file::${source.name}::${source.size}::${source.lastModified}`;
    const cachedId = this.sourceToMaskId.get(sourceKey);
    const cachedMask = cachedId ? this.masksById.get(cachedId) : null;
    if (cachedId && cachedMask) {
      return { maskId: cachedId, mask: cachedMask };
    }

    const blob = await this.photos.read(source, scope);
    const imageDataUrl = await this.prepareMaskInputDataUri(blob);
    const { data, error } = await this.supabase.client.functions.invoke<MaskFunctionResponse>(
      'vinted-photo-background-mask',
      {
        body: { workspaceId, imageDataUrl },
        timeout: 55_000,
      },
    );
    if (error) {
      let code: unknown;
      if (error.context instanceof Response) {
        const body: unknown = await error.context
          .clone()
          .json()
          .catch(() => null);
        code = body && typeof body === 'object' && 'error' in body ? body.error : null;
      }
      throw new Error(
        typeof code === 'string' && ERROR_MESSAGES[code]
          ? ERROR_MESSAGES[code]
          : 'Die KI-Untergrundberuhigung ist gerade nicht verfügbar.',
      );
    }
    if (!data?.maskId || !data?.maskBase64) {
      throw new Error('Die KI-Untergrundberuhigung hat keine gültige Maske geliefert.');
    }
    const mask: ForegroundPhotoMask = {
      base64: data.maskBase64,
      mimeType: data.maskMimeType ?? 'image/png',
    };
    this.masksById.set(data.maskId, mask);
    this.sourceToMaskId.set(sourceKey, data.maskId);
    return { maskId: data.maskId, mask };
  }

  async loadStoredMask(workspaceId: string, maskId: string): Promise<ForegroundPhotoMask> {
    const cached = this.masksById.get(maskId);
    if (cached) return cached;
    const pending = this.inflightLoads.get(maskId);
    if (pending) return pending;

    const load = (async () => {
      const { data, error } = await this.supabase.client.storage
        .from('marketplace-listing-masks')
        .download(`${workspaceId}/${maskId}.png`);
      if (error || !data) {
        throw new Error('Die gespeicherte Vordergrundmaske konnte nicht geladen werden.');
      }
      const base64 = await readBlobAsBase64(data);
      const mask: ForegroundPhotoMask = { base64, mimeType: 'image/png' };
      this.masksById.set(maskId, mask);
      return mask;
    })().finally(() => {
      this.inflightLoads.delete(maskId);
    });
    this.inflightLoads.set(maskId, load);
    return load;
  }

  private async prepareMaskInputDataUri(blob: Blob): Promise<string> {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
      return await readBlobAsDataUri(blob);
    }
    try {
      const bitmap = await createImageBitmap(blob);
      try {
        const longest = Math.max(bitmap.width, bitmap.height);
        if (longest <= MAX_MASK_REQUEST_EDGE && blob.size <= 3_500_000) {
          return await readBlobAsDataUri(blob);
        }
        const scale = Math.min(1, MAX_MASK_REQUEST_EDGE / longest);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return await readBlobAsDataUri(blob);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.9);
      } finally {
        bitmap.close();
      }
    } catch {
      return await readBlobAsDataUri(blob);
    }
  }
}
