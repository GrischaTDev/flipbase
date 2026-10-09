import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { WorkspaceAccessService } from '../../../../core/services/workspace-access.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { SizeReferenceService } from '../../services/size-reference.service';
import type { SizeReference } from '../../models/size-reference';
import { PublishedSizeReferencesComponent } from './published-size-references.component';

const reference: SizeReference = {
  id: 1,
  version: 1,
  brandId: null,
  brandName: null,
  archived: false,
  published: true,
  hasDraftChanges: false,
  content: {
    title: 'Zusätzliche Jeansreferenz',
    category: 'trousers',
    audience: 'women',
    measurement: 'garment',
    notes: '',
    sourceTitle: 'Beispielquelle',
    sourceUrl: 'https://example.com/sizes',
    reviewedAt: '2026-10-09',
    columns: ['Label', 'Bundweite'],
    rows: [['S', '36']],
  },
};

function setup() {
  const user = signal<{ id: string } | null>({ id: 'one' });
  const workspace = signal({ id: 'workspace-one' });
  const service = { list: vi.fn().mockResolvedValue([]) };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: WorkspaceAccessService, useValue: { access: signal([]) } },
      { provide: PlatformOperatorService, useValue: { operator: signal(true) } },
      { provide: SizeReferenceService, useValue: service },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new PublishedSizeReferencesComponent());
  return { component, service, user, workspace };
}

async function settle() {
  TestBed.tick();
  for (let index = 0; index < 8; index++) await Promise.resolve();
  TestBed.tick();
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

describe('Zusätzliche veröffentlichte Größenreferenzen', () => {
  it('lädt nur die Leseransicht und entfernt Entwürfe sowie archivierte Tabellen', async () => {
    const { component, service } = setup();
    service.list.mockResolvedValue([
      reference,
      { ...reference, id: 2, published: false },
      { ...reference, id: 3, archived: true },
    ]);
    await settle();
    expect(service.list).toHaveBeenCalledWith(false);
    expect(component.items()).toEqual([reference]);
  });

  it('begrenzt einen Ladefehler auf die zusätzlichen Tabellen', async () => {
    const { component, service } = setup();
    service.list.mockRejectedValue(new Error('offline'));
    await settle();
    expect(component.items()).toEqual([]);
    expect(component.error()).toContain('bleibt verfügbar');
    expect(component.loading()).toBe(false);
  });

  it('entfernt veröffentlichte Daten unmittelbar beim Abmelden', async () => {
    const { component, service, user } = setup();
    service.list.mockResolvedValue([reference]);
    await settle();
    expect(component.items()).toHaveLength(1);
    user.set(null);
    expect(component.items()).toEqual([]);
    await settle();
    expect(component.items()).toEqual([]);
  });

  it('ignoriert eine verspätete Antwort nach dem Workspacewechsel', async () => {
    const { component, service, workspace } = setup();
    await settle();
    let resolveReferences: (references: readonly SizeReference[]) => void = () => undefined;
    service.list.mockImplementationOnce(
      () => new Promise((resolve) => (resolveReferences = resolve)),
    );
    const load = component.load();
    workspace.set({ id: 'workspace-two' });
    await settle();
    resolveReferences([reference]);
    await load;
    expect(component.items()).toEqual([]);
  });
});
