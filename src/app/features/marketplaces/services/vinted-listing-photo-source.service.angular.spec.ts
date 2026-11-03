import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { VintedListingPhotoSourceService } from './vinted-listing-photo-source.service';

const scope = { workspaceId: 'workspace-a', connectionId: 'account-a', entryId: 'entry-a' };
function setup() {
  const user = signal<{ id: string } | null>({ id: 'user-a' });
  const workspace = signal({ id: 'workspace-a', archived_at: null });
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: { currentUser: user, session: signal({ access_token: 'fixture-token' }) },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
    ],
  });
  const request = vi.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob(['original'], { type: 'image/jpeg' }),
  });
  vi.stubGlobal('fetch', request);
  return { service: TestBed.inject(VintedListingPhotoSourceService), request, user, workspace };
}
afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});

describe('Lesbare Vinted-Originalfotos', () => {
  it('holt CDN-Bildbytes nur über den authentifizierten eigenen Endpunkt', async () => {
    const f = setup();
    const source = 'https://images1.vinted.net/original.jpg';
    expect((await f.service.read(source, scope)).size).toBe(8);
    expect(f.request).toHaveBeenCalledOnce();
    const [url, init] = f.request.mock.calls[0];
    expect(url).toBe('/marketplace-browser/listings/photo/read');
    expect(init.headers.Authorization).toBe('Bearer fixture-token');
    expect(JSON.parse(init.body)).toEqual({ ...scope, photoUrl: source });
  });
  it('verweigert fremde Arbeitsbereiche und hält die Bytes nach einem Benutzerwechsel zurück', async () => {
    const f = setup();
    const source = 'https://images1.vinted.net/original.jpg';
    await expect(f.service.read(source, { ...scope, workspaceId: 'foreign' })).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
    f.request.mockImplementation(async () => {
      f.user.set({ id: 'user-b' });
      return { ok: true, blob: async () => new Blob(['original'], { type: 'image/jpeg' }) };
    });
    await expect(f.service.read(source, scope)).rejects.toThrow('Originalfoto');
  });
  it('behält lokale Originaldateien und private Storageadressen ohne Anbieterproxy bei', async () => {
    const f = setup();
    const original = new File(['original'], 'camera.jpg', { type: 'image/jpeg' });
    expect(await f.service.read(original)).toBe(original);
    expect(f.request).not.toHaveBeenCalled();
    await f.service.read('https://api.example/storage/v1/object/sign/private.jpg?token=fixture');
    expect(f.request.mock.calls[0][0]).toContain('/storage/v1/object/sign/private.jpg');
    expect(f.request.mock.calls[0][1].credentials).toBe('omit');
    expect(f.request.mock.calls[0][1]).not.toHaveProperty('headers');
  });
});
