import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  readLabelArray,
  readLabelId,
  readLabelObject,
  readLabelText,
} from '../models/brand-label-validation';
import { LabelRpcError } from '../models/brand-label-rpc';
import { environment } from '../../../../environments/environment';

export interface LabelAdminImage {
  readonly assetId: number;
  readonly attribution: string;
  readonly allowedUse: string;
  readonly status: 'approved' | 'revoked';
  readonly version: number;
}
export interface LabelImageUpload {
  readonly original: File;
  readonly image: Blob;
  readonly attribution: string;
  readonly allowedUse: string;
  readonly requestId: string;
}

@Injectable({ providedIn: 'root' })
export class LabelMediaService {
  private readonly client = inject(SupabaseService).client;

  async list(): Promise<readonly LabelAdminImage[]> {
    const { data, error } = await this.client.rpc('list_label_admin_images');
    if (error?.code === '42501') throw new LabelRpcError('forbidden');
    if (error) throw new Error('Die Bildverwaltung konnte nicht geladen werden.');
    return readLabelArray(data, 10000, 'images').map((entry) => {
      const image = readLabelObject(
        entry,
        ['assetId', 'attribution', 'allowedUse', 'status', 'version'],
        'image',
      );
      const status = image['status'];
      if (status !== 'approved' && status !== 'revoked') throw new Error('Ungültige Bildantwort.');
      return {
        assetId: readLabelId(image['assetId'], 'image.assetId'),
        attribution: readLabelText(image['attribution'], 4000, 'image.attribution'),
        allowedUse: readLabelText(image['allowedUse'], 4000, 'image.allowedUse'),
        status,
        version: readLabelId(image['version'], 'image.version'),
      };
    });
  }

  async prepare(
    original: File,
    attribution: string,
    allowedUse: string,
  ): Promise<LabelImageUpload> {
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(original.type) ||
      original.size > 10000000 ||
      !original.size ||
      !attribution.trim() ||
      !allowedUse.trim()
    )
      throw new Error(
        'Bitte wähle ein Bild bis 10 MB und gib Bildnachweis und erlaubte Verwendung an.',
      );
    const bitmap = await createImageBitmap(original);
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 24000000) {
        throw new Error('Das Bild darf höchstens 24 Millionen Pixel haben.');
      }
      const factor = Math.min(1, 1200 / bitmap.width, 1200 / bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * factor));
      canvas.height = Math.max(1, Math.round(bitmap.height * factor));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Das Bild konnte nicht verarbeitet werden.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error('Das Bild konnte nicht verarbeitet werden.')),
          'image/png',
        ),
      );
      return Object.freeze({
        original,
        image,
        attribution: attribution.trim(),
        allowedUse: allowedUse.trim(),
        requestId: crypto.randomUUID(),
      });
    } finally {
      bitmap.close();
    }
  }

  async upload(command: LabelImageUpload): Promise<number> {
    const form = new FormData();
    form.set('original', command.original);
    form.set('image', command.image, 'reference.png');
    form.set('requestId', command.requestId);
    form.set('attribution', command.attribution);
    form.set('allowedUse', command.allowedUse);
    const { data, error } = await this.client.functions.invoke('brand-label-media', { body: form });
    if (
      error &&
      'context' in error &&
      error.context instanceof Response &&
      error.context.status === 403
    )
      throw new LabelRpcError('forbidden');
    if (error) throw new Error('Der Upload ist nicht bestätigt. Wiederhole denselben Auftrag.');
    const receipt = readLabelObject(data, ['assetId'], 'receipt');
    return readLabelId(receipt['assetId'], 'receipt.assetId');
  }

  async signedUrl(assetId: number): Promise<string | null> {
    if (!Number.isInteger(assetId) || assetId < 1) return null;
    const { data, error } = await this.client.functions.invoke('brand-label-media', {
      body: { assetId },
    });
    if (error) return null;
    const receipt = readLabelObject(data, ['signedUrl'], 'image');
    const signedUrl = readLabelText(receipt['signedUrl'], 4096, 'image.signedUrl');
    if (!/^https?:\/\//.test(signedUrl)) return null;
    const address = new URL(signedUrl);
    if (
      address.pathname !== `/storage/v1/object/sign/label-images/${assetId}.png` ||
      !address.searchParams.get('token')
    )
      return null;
    // Edge Functions kennen die interne Gateway-Adresse; der Browser nutzt den konfigurierten öffentlichen Zugang.
    return `${environment.supabaseUrl.replace(/\/$/, '')}${address.pathname}${address.search}`;
  }

  async setPermission(
    image: LabelAdminImage,
    status: 'approved' | 'revoked',
    requestId: string,
  ): Promise<void> {
    const { data, error } = await this.client.rpc('set_label_image_permission', {
      p_asset_id: image.assetId,
      p_expected_version: image.version,
      p_status: status,
      p_attribution: image.attribution,
      p_allowed_use: image.allowedUse,
      p_request_id: requestId,
    });
    if (error?.code === '42501') throw new LabelRpcError('forbidden');
    if (
      error ||
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      data['version'] !== image.version + 1
    ) {
      throw new Error(
        error?.code === 'P0001'
          ? 'Die Bildfreigabe wurde inzwischen geändert. Bitte lade neu.'
          : 'Die Änderung ist nicht bestätigt.',
      );
    }
  }
}
