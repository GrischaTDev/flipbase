import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../../core/services/auth.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PlatformOperatorService } from '../../../../core/services/platform-operator.service';
import { MarketplaceSettingsService } from '../../../../core/services/marketplace-settings.service';
import { MarketplaceOverviewStore } from '../../services/marketplace-overview.store';
import type { MarketplaceOverviewAccount } from '../../models/marketplace-overview.models';
import { MarketplaceOverviewComponent } from './marketplace-overview.component';

const account: MarketplaceOverviewAccount = {
  platform: 'vinted',
  workspaceId: 'ws-a',
  connectionId: 'account-a',
  displayName: 'Konto A',
  status: 'connected',
  activeCount: null,
  listingCount: 1,
  observedAt: null,
  completeness: 'partial',
  supportsSearch: true,
  supportsStatus: true,
  canEdit: false,
  error: null,
};
describe('Kontoverwaltung in der Marktplatzübersicht', () => {
  const currentUser = signal<{ id: string } | null>({ id: 'user-a' });
  const currentWorkspace = signal<{ id: string; archived_at?: string } | null>({ id: 'ws-a' });
  const navigate = vi.fn();
  const platforms = signal([
    { platform: 'vinted', accounts: [account], loading: false, error: null },
  ]);
  beforeEach(() => {
    currentUser.set({ id: 'user-a' });
    currentWorkspace.set({ id: 'ws-a' });
    navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser } },
        { provide: WorkspaceService, useValue: { currentWorkspace } },
        { provide: PlatformOperatorService, useValue: { operator: signal(false) } },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        {
          provide: MarketplaceSettingsService,
          useValue: {
            settings: signal({ vinted: true, ebay: true, kleinanzeigen: true }),
            ready: signal(false),
          },
        },
        { provide: MarketplaceOverviewStore, useValue: { platforms, refreshPlatform: vi.fn() } },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  it('bietet Vinted in der Plattformauswahl auch ohne Betreiberrolle an', () => {
    const component = TestBed.runInInjectionContext(() => new MarketplaceOverviewComponent());
    expect(component.enabledPlatforms()).toContain('vinted');
  });
  it('öffnet Vinted im Modal der Übersicht statt zur Kontenseite zu navigieren', async () => {
    const component = TestBed.runInInjectionContext(() => new MarketplaceOverviewComponent());
    await component.manageAccount(account);
    expect(component.managedAccount()?.connectionId).toBe('account-a');
    expect(navigate).not.toHaveBeenCalled();
  });
  it('verwirft die geöffnete Verwaltung beim Arbeitsbereichwechsel', async () => {
    const component = TestBed.runInInjectionContext(() => new MarketplaceOverviewComponent());
    await component.manageAccount(account);
    currentWorkspace.set({ id: 'ws-b' });
    expect(component.managedAccount()).toBeNull();
  });
  it('wählt selbst bei einem Konto erst nach ausdrücklichem Klick und übergibt dessen Kontext', async () => {
    const component = TestBed.runInInjectionContext(() => new MarketplaceOverviewComponent());
    component.openCreate();
    component.createPlatform.set('vinted');
    expect(navigate).not.toHaveBeenCalled();
    await component.createForAccount(account);
    expect(navigate).toHaveBeenCalledWith(['/marketplaces/vinted/listings/new'], {
      queryParams: { connectionId: 'account-a', workspaceId: 'ws-a' },
    });
  });
  it('öffnet nach Workspacewechsel kein Konto aus der vorherigen Auswahl', async () => {
    const component = TestBed.runInInjectionContext(() => new MarketplaceOverviewComponent());
    component.openCreate();
    component.createPlatform.set('vinted');
    currentWorkspace.set({ id: 'ws-b' });
    await component.createForAccount(account);
    expect(navigate).not.toHaveBeenCalled();
  });
  it('löst per Drag-and-Drop eines Vinted-Inserats auf Kleinanzeigen den Übertragungsdialog aus', () => {
    const ready = TestBed.inject(MarketplaceSettingsService).ready as ReturnType<
      typeof signal<boolean>
    >;
    ready.set(true);
    const component = TestBed.runInInjectionContext(() => new MarketplaceOverviewComponent());
    const vintedRef = {
      platform: 'vinted' as const,
      workspaceId: 'ws-a',
      connectionId: 'account-a',
      externalId: '12345',
    };
    const kleinanzeigenAccount: MarketplaceOverviewAccount = {
      ...account,
      platform: 'kleinanzeigen',
      connectionId: 'ka-1',
    };

    component.onListingDragStart(vintedRef);
    expect(component.canAcceptListingDrop('kleinanzeigen')).toBe(true);
    expect(component.canAcceptListingDrop('ebay')).toBe(false);

    const dropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as DragEvent;
    component.onDropOnAccount(dropEvent, kleinanzeigenAccount);

    expect(dropEvent.preventDefault).toHaveBeenCalled();
    expect(component.draggedListing()).toBeNull();
    expect(component.dragTransfer()).toEqual({
      source: vintedRef,
      targetConnectionId: 'ka-1',
    });
  });
});
