import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { AuthService } from '../../src/app/core/services/auth.service';
import { WorkspaceService } from '../../src/app/core/services/workspace.service';
import { VintedListingPhotoSourceService } from '../../src/app/features/marketplaces/services/vinted-listing-photo-source.service';
export { renderVintedListingPhoto } from '../../supabase/functions/_shared/vinted-listing-photo-renderer.mjs';

// Nur die unbenutzten Kontodienste sind ersetzt; Fotoabruf und Renderer sind Produktcode.
const injector = Injector.create({
  providers: [
    { provide: AuthService, useValue: {} },
    { provide: WorkspaceService, useValue: {} },
  ],
});
const photos = runInInjectionContext(injector, () => new VintedListingPhotoSourceService());

export async function readOriginal(source: string) {
  const photo = await photos.read(source);
  return {
    base64: await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result.slice(reader.result.indexOf(',') + 1))
          : reject(new Error('Originalfoto fehlt.'));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(photo);
    }),
    mimeType: photo.type,
  };
}
