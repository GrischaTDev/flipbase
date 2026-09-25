import { Injectable } from '@angular/core';
import imageCompression from 'browser-image-compression';

export const PRODUCT_SEARCH_PHOTO_MAX_BYTES = 5_000_000;

@Injectable({ providedIn: 'root' })
export class ProductSearchPhotoService {
  async prepare(file: File): Promise<File> {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Bitte ein JPG-, PNG- oder WebP-Foto auswählen.');
    }

    let compressed: File;
    try {
      compressed = await imageCompression(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 2400,
        fileType: 'image/jpeg',
        initialQuality: 0.9,
        useWebWorker: false,
      });
    } catch {
      throw new Error('Das Foto konnte nicht verkleinert werden. Bitte versuche ein anderes Bild.');
    }
    const prepared = compressed.size < file.size ? compressed : file;
    if (prepared.size > PRODUCT_SEARCH_PHOTO_MAX_BYTES) {
      throw new Error('Das Foto ist auch nach dem Verkleinern größer als 5 MB.');
    }

    if (prepared.type !== 'image/jpeg' || prepared === file) return prepared;
    return new File([prepared], file.name.replace(/\.[^.]+$/u, '.jpg'), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  }
}
