import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { MarketplaceOverviewStore } from '../../services/marketplace-overview.store';
import { KleinanzeigenWorkspaceComponent } from './kleinanzeigen-workspace.component';

describe('Kleinanzeigen-Arbeitsbereich', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('lädt den neuen Arbeitsbereich sofort, auch wenn der alte Abruf noch läuft', async () => {
    let finishFirst!: () => void;
    const firstRead = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const currentWorkspace = signal({ id: 'first', archived_at: null });
    const store = {
      platforms: signal([]),
      sections: signal({}),
      load: vi
        .fn()
        .mockImplementation((workspaceId: string) =>
          workspaceId === 'first' ? firstRead : Promise.resolve(),
        ),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: MarketplaceOverviewStore, useValue: store },
        { provide: ActivatedRoute, useValue: { snapshot: { data: { page: 'overview' } } } },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'owner' }) } },
        { provide: WorkspaceService, useValue: { currentWorkspace } },
      ],
    });
    TestBed.runInInjectionContext(() => new KleinanzeigenWorkspaceComponent());
    TestBed.tick();
    expect(store.load).toHaveBeenCalledWith('first', ['kleinanzeigen']);
    currentWorkspace.set({ id: 'second', archived_at: null });
    TestBed.tick();
    expect(store.load).toHaveBeenCalledWith('second', ['kleinanzeigen']);
    finishFirst();
    await firstRead;
    TestBed.tick();
    expect(store.load).toHaveBeenCalledTimes(2);
  });
});
