import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { KleinanzeigenFormSchemaService } from './kleinanzeigen-form-schema.service';
import { KleinanzeigenExtensionBridge } from './kleinanzeigen-extension-bridge';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
const scope = {
  workspaceId: '50300000-0000-4000-8000-000000000011',
  connectionId: '9',
  externalAccountId: '88',
  generation: 2,
};
function fixture() {
  const auth = { currentUser: signal<{ id: string } | null>({ id: 'owner' }) };
  const workspace = {
    currentWorkspace: signal({ id: scope.workspaceId, archived_at: null as string | null }),
  };
  const bridge = {
    formSchemaAvailable: signal(true),
    loadFormSchema: vi.fn(),
    status: vi.fn().mockResolvedValue(scope),
    cancel: vi.fn(),
  };
  TestBed.configureTestingModule({
    providers: [
      KleinanzeigenFormSchemaService,
      { provide: AuthService, useValue: auth },
      { provide: WorkspaceService, useValue: workspace },
      { provide: KleinanzeigenExtensionBridge, useValue: bridge },
    ],
  });
  return { service: TestBed.inject(KleinanzeigenFormSchemaService), auth, workspace, bridge };
}
afterEach(() => TestBed.resetTestingModule());
describe('Kontogebundene Kleinanzeigen-Formularfelder', () => {
  it('liest nur für die aktuelle lokale Bindung', async () => {
    const f = fixture();
    f.bridge.loadFormSchema.mockResolvedValue({ categoryPath: '153' });
    await expect(f.service.browse(scope, '153')).resolves.toEqual({ categoryPath: '153' });
    expect(f.bridge.loadFormSchema).toHaveBeenCalledWith(scope, '153');
    f.bridge.status.mockResolvedValue({ ...scope, connectionId: '10' });
    await expect(f.service.browse(scope, '153')).rejects.toThrow('Browserprofil');
  });
  it('verwirft späte Antworten nach Abmeldung', async () => {
    const f = fixture();
    let resolve!: (value: unknown) => void;
    f.bridge.loadFormSchema.mockImplementation(() => new Promise((done) => (resolve = done)));
    const pending = f.service.browse(scope, '153');
    await Promise.resolve();
    await Promise.resolve();
    f.auth.currentUser.set(null);
    resolve({ categoryPath: '153' });
    await expect(pending).rejects.toThrow('Anmeldung');
  });
  it('erfindet ohne erreichbare Formularfähigkeit keine Felder', async () => {
    const f = fixture();
    f.bridge.formSchemaAvailable.set(false);
    await expect(f.service.browse(scope, '')).rejects.toThrow('Erweiterung');
    expect(f.bridge.status).not.toHaveBeenCalled();
  });
});
