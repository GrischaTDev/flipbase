import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';

export interface VintedListingPhotoScope {
  readonly workspaceId: string;
  readonly connectionId: string;
  readonly entryId: string;
}

/** Canvas und Upload lesen dieselben Originalbytes, ohne browserseitigen CDN-CORS-Zugriff. */
@Injectable({ providedIn: 'root' })
export class VintedListingPhotoSourceService {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceService);

  async read(source: File | string, scope?: VintedListingPhotoScope | null): Promise<Blob> {
    if (typeof source !== 'string') return source;
    const provider = /^https:\/\/images[12]\.vinted\.net\//i.test(source);
    const userId = provider ? this.auth.currentUser()?.id : null;
    const token = provider ? this.auth.session()?.access_token : null;
    const allowed = () =>
      !provider ||
      (!!scope &&
        !!userId &&
        !!token &&
        this.auth.currentUser()?.id === userId &&
        this.workspace.currentWorkspace()?.id === scope.workspaceId &&
        !this.workspace.currentWorkspace()?.archived_at);
    if (!allowed())
      throw new Error('Das Originalfoto kann diesem Arbeitsbereich nicht zugeordnet werden.');
    let response: Response;
    try {
      response = await fetch(provider ? '/marketplace-browser/listings/photo/read' : source, {
        ...(provider
          ? {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...scope, photoUrl: source }),
            }
          : {
              credentials: 'omit' as const,
              // Bereits angezeigte Fotos können ohne CORS-Header im HTTP-Cache liegen.
              cache: 'no-store' as const,
            }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error('Originalfoto nicht verfügbar.');
      const blob = await response.blob();
      if (
        !allowed() ||
        blob.size < 1 ||
        blob.size > 50 * 1024 * 1024 ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)
      )
        throw new Error('Originalfoto nicht lesbar.');
      return blob;
    } catch {
      throw new Error('Das Originalfoto konnte nicht geladen werden. Versuche es erneut.');
    }
  }
}
