import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { AuthService } from '../../../../core/services/auth.service';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import { MarketplaceListingStatisticsStore } from '../../services/marketplace-listing-statistics.store';
import { MarketplaceApiService } from '../../services/marketplace-api.service';
import { createMarketplaceFixtures } from '../../testing/marketplace-fixtures';
import { VintedListingJobService } from '../../services/vinted-listing-job.service';
import { VintedListingDraftService } from '../../services/vinted-listing-draft.service';
import { VintedListingImageService } from '../../services/vinted-listing-image.service';
import { VintedRelistingPlanStore } from '../../services/vinted-relisting-plan.store';
import { VintedListingsComponent } from './vinted-listings.component';
import { parseMarketplacePage } from '../../models/marketplace-response';
import { emptyVintedListingContent } from '../../models/vinted-listing-content';
import { parseVintedListingJob } from '../../models/vinted-listing-job';
import type { MarketplaceEntry } from '../../models/marketplace-read.models';
import type { MarketplaceConnection } from '../../models/marketplace.models';
import type { VintedRelistingPlanRecord } from '../../models/vinted-relisting-plan';
import { vintedListingSourceContent } from '../../models/vinted-listing-source';
import { VintedListingOperationStore } from '../../services/vinted-listing-operation.store';
import { ToastService } from '../../../../shared/components/toast/toast.service';

const [accountA, accountB] = createMarketplaceFixtures().connections;
afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
});

function setup(connectionId: string) {
  const query = new BehaviorSubject(convertToParamMap({ connectionId }));
  const connections = signal<(typeof accountA)[]>([]);
  const selectedConnection = signal(accountA);
  const loading = signal(true);
  const store = {
    connections,
    canManage: signal(true),
    selectedConnection,
    loading,
    loadingSnapshot: signal(false),
    selectionVersion: signal(1),
    snapshot: signal(null),
    listingMetricChanges: signal({}),
    consumeListingMetricChanges: () => ({}),
    saveListingPrice: vi.fn().mockResolvedValue(undefined),
    deleteListing: vi.fn().mockResolvedValue(undefined),
    async selectConnection(id: string) {
      this.selectionVersion.update((value) => value + 1);
      const account = connections().find((item) => item.connectionId === id);
      if (account) selectedConnection.set(account);
    },
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: VintedRelistingPlanStore,
        useValue: {
          plans: signal([]),
          error: signal(null),
          refresh: vi.fn(),
          canEdit: VintedRelistingPlanStore.prototype.canEdit,
        },
      },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'price-user' }) } },
      MarketplaceListingStatisticsStore,
      { provide: MarketplaceApiService, useValue: { readListingStatistics: vi.fn() } },
      { provide: MarketplaceAccountStore, useValue: store },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: accountA.workspaceId }) },
      },
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: query, snapshot: { queryParamMap: query.value } },
      },
      {
        provide: Router,
        useValue: {
          async navigate() {
            query.next(convertToParamMap({}));
            return true;
          },
        },
      },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new VintedListingsComponent());
  return { component, store, query };
}

it('wählt das Konto aus einem Favoritenlink nach dem Laden einmalig und respektiert danach Deinen Kontowechsel', async () => {
  const { store } = setup(accountB.connectionId);
  TestBed.tick();
  expect(store.selectedConnection().connectionId).toBe(accountA.connectionId);
  store.connections.set([accountA, accountB]);
  store.loading.set(false);
  TestBed.tick();
  await Promise.resolve();
  TestBed.tick();
  expect(store.selectedConnection().connectionId).toBe(accountB.connectionId);
  await store.selectConnection(accountA.connectionId);
  TestBed.tick();
  expect(store.selectedConnection().connectionId).toBe(accountA.connectionId);
});

it('verbraucht den Linkparameter, damit ein neuer Mount nach manuellem Kontowechsel nicht zurückwählt', async () => {
  const { store, query } = setup(accountB.connectionId);
  store.connections.set([accountA, accountB]);
  store.loading.set(false);
  TestBed.tick();
  await Promise.resolve();
  TestBed.tick();
  expect(query.value.get('connectionId')).toBeNull();
  await store.selectConnection(accountA.connectionId);
  TestBed.runInInjectionContext(() => new VintedListingsComponent());
  TestBed.tick();
  expect(store.selectedConnection().connectionId).toBe(accountA.connectionId);
});

it.each(['foreign-account', ''])('ignoriert einen fremden oder leeren Kontoquery %j', (id) => {
  const { store } = setup(id);
  const select = vi.spyOn(store, 'selectConnection');
  store.connections.set([accountA, accountB]);
  store.loading.set(false);
  TestBed.tick();
  expect(store.selectedConnection().connectionId).toBe(accountA.connectionId);
  expect(select).not.toHaveBeenCalled();
});

it('akzeptiert auch eine bekannte Konto-ID nur aus Deinem aktuellen Workspace', () => {
  const { store } = setup(accountB.connectionId);
  store.connections.set([accountA, { ...accountB, workspaceId: 'foreign-workspace' }]);
  store.loading.set(false);
  TestBed.tick();
  expect(store.selectedConnection().connectionId).toBe(accountA.connectionId);
});

it('bindet keine Statistik mehr in den Kleiderschrank ein', async () => {
  const { readFile } = await import('node:fs/promises');
  const template = await readFile(
    'src/app/features/marketplaces/components/vinted-listings/vinted-listings.component.html',
    'utf8',
  );
  expect(template).not.toContain('app-vinted-wardrobe-statistics');
});

it('schließt den Preisdialog sofort und zeigt einen Fehler in den laufenden Aktionen', async () => {
  const { component, store } = setup('');
  TestBed.tick();
  const entry = parseMarketplacePage(
    {
      items: [
        {
          ...accountA,
          id: 'price-1',
          title: 'Schal',
          price: 29.9,
          currency: 'EUR',
          publicationState: 'active',
        },
      ],
      total: 1,
      nextCursor: null,
    },
    accountA,
  ).items[0];
  component.changePrice(entry, new MouseEvent('click'));
  expect(component.priceEditor.open()).toBe(true);
  expect(component.priceEditor.control.value).toBe(29.9);
  component.priceEditor.control.setValue(25);
  store.saveListingPrice.mockRejectedValueOnce(new Error('Nicht bestätigt'));
  await component.priceEditor.save();
  expect(component.priceEditor.control.value).toBe(25);
  expect(component.priceEditor.error()).toBe('Nicht bestätigt');
  expect(component.priceEditor.open()).toBe(false);
  expect(component.operations.entries()[0]).toMatchObject({
    state: 'error',
    title: 'Schal',
    message: 'Nicht bestätigt',
  });
  expect(TestBed.inject(ToastService).toasts()).toEqual([]);
  component.changePrice(entry, new MouseEvent('click'));
  component.priceEditor.control.setValue(25);
  await component.priceEditor.save();
  expect(store.saveListingPrice).toHaveBeenLastCalledWith(
    accountA.connectionId,
    'price-1',
    2990,
    2500,
  );
  expect(component.priceEditor.open()).toBe(false);
  expect(TestBed.inject(ToastService).toasts()).toMatchObject([
    { type: 'success', title: 'Preis erfolgreich geändert', description: 'Schal' },
  ]);
  expect(component.operations.entries().some((action) => action.state === 'success')).toBe(false);
});

it('erhält Preisdialog und laufende Speicherung bei einer Hintergrundaktualisierung desselben Kontos', async () => {
  const { component, store } = setup('');
  TestBed.tick();
  const entry = parseMarketplacePage(
    {
      items: [{ ...accountA, id: 'price-1', price: 29.9, currency: 'EUR' }],
      total: 1,
      nextCursor: null,
    },
    accountA,
  ).items[0];
  component.changePrice(entry, new MouseEvent('click'));
  component.priceEditor.control.setValue(25);
  store.selectedConnection.set({ ...store.selectedConnection() });
  TestBed.tick();
  expect(component.priceEditor.open()).toBe(true);
  expect(component.priceEditor.control.value).toBe(25);
  let finish!: () => void;
  store.saveListingPrice.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
  const saving = component.priceEditor.save();
  store.selectedConnection.set({ ...store.selectedConnection() });
  TestBed.tick();
  expect(component.savingPrice()).toBe(true);
  expect(component.priceEditor.open()).toBe(false);
  expect(component.operations.isRunning(entry)).toBe(true);
  expect(component.isPreparingRelisting(entry)).toBe(false);
  await component.priceEditor.save();
  expect(store.saveListingPrice).toHaveBeenCalledOnce();
  finish();
  await saving;
  expect(TestBed.inject(ToastService).toasts()).toMatchObject([
    { type: 'success', title: 'Preis erfolgreich geändert' },
  ]);
  expect(component.operations.entries()).toEqual([]);
});

it('schließt bei einem Kontowechsel den Preisdialog und verwirft verspätete Antworten', async () => {
  const { component, store } = setup('');
  TestBed.tick();
  const entry = parseMarketplacePage(
    {
      items: [{ ...accountA, id: 'price-1', price: 29.9, currency: 'EUR' }],
      total: 1,
      nextCursor: null,
    },
    accountA,
  ).items[0];
  component.changePrice(entry, new MouseEvent('click'));
  component.priceEditor.control.setValue(25);
  let finish!: () => void;
  store.saveListingPrice.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
  const saving = component.priceEditor.save();
  await component.priceEditor.save();
  component.priceEditor.close();
  expect(component.priceEditor.open()).toBe(false);
  expect(store.saveListingPrice).toHaveBeenCalledOnce();
  store.selectionVersion.update((version) => version + 1);
  TestBed.tick();
  finish();
  await saving;
  expect(component.priceEditor.open()).toBe(false);
  expect(component.priceEntry()).toBe(null);
  // Der appweite Abschluss bleibt auch beim Wechsel der Artikelansicht sichtbar.
  expect(TestBed.inject(ToastService).toasts()).toMatchObject([
    { type: 'success', title: 'Preis erfolgreich geändert' },
  ]);
});

async function settlePlans() {
  TestBed.tick();
  for (let index = 0; index < 12; index++) await Promise.resolve();
  TestBed.tick();
}
function pendingPlans() {
  const selectedConnection = signal(accountA);
  let resolve!: (value: readonly never[]) => void;
  const first = new Promise<readonly never[]>((done) => (resolve = done));
  const listPlans = vi.fn().mockReturnValueOnce(first).mockResolvedValue([]);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: accountA.workspaceId }) },
      },
      { provide: AuthService, useValue: { currentUser: signal({ id: 'plan-user' }) } },
      {
        provide: MarketplaceAccountStore,
        useValue: { selectedConnection, canManage: signal(true) },
      },
      {
        provide: VintedListingJobService,
        useValue: { listPlans, listen: vi.fn(() => () => undefined) },
      },
      { provide: VintedListingDraftService, useValue: {} },
      { provide: VintedListingImageService, useValue: {} },
    ],
  });
  const plans = TestBed.runInInjectionContext(() => new VintedRelistingPlanStore());
  return { plans, selectedConnection, listPlans, resolve };
}
it('verwirft den verspäteten Planabruf eines zuvor gewählten Kontos', async () => {
  const f = pendingPlans();
  await settlePlans();
  f.selectedConnection.set(accountB);
  await settlePlans();
  f.resolve([]);
  await settlePlans();
  expect(f.listPlans).toHaveBeenLastCalledWith(accountB.workspaceId, accountB.connectionId);
  expect(f.plans.plans()).toEqual([]);
});
it('startet nach dem Schließen des Kleiderschranks keinen weiteren Planabruf', async () => {
  const f = pendingPlans();
  await settlePlans();
  TestBed.resetTestingModule();
  f.resolve([]);
  for (let index = 0; index < 12; index++) await Promise.resolve();
  expect(f.listPlans).toHaveBeenCalledOnce();
});

function acceptedPlan(): VintedRelistingPlanRecord {
  const draft = {
    id: '20',
    workspaceId: accountA.workspaceId,
    connectionId: '46300000-0000-4000-8000-000000000021',
    revision: 1,
    relistExternalId: '123',
    inventoryItemId: null,
    content: { ...emptyVintedListingContent(), title: 'Beauftragte Jacke', priceCents: 2000 },
    images: [],
    createdAt: '2026-11-02T12:00:00Z',
    updatedAt: '2026-11-02T12:00:00Z',
  };
  const job = parseVintedListingJob(
    {
      id: '30',
      workspaceId: draft.workspaceId,
      connectionId: draft.connectionId,
      draftId: draft.id,
      draftRevision: 1,
      externalAccountId: '123',
      executionMode: 'cloud',
      action: 'publish',
      state: 'queued',
      version: 1,
      scheduledAt: '2026-11-03T18:00:00Z',
      timeZone: 'Europe/Berlin',
      latePolicy: 'pause_after_30_minutes',
      errorCode: null,
      externalId: null,
      providerState: null,
      verifiedAt: null,
      replacesJobId: null,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      relistExternalId: '123',
      relistDeletedAt: '2026-11-03T11:55:00Z',
      itemTitle: draft.content.title,
    },
    draft.workspaceId,
  );
  return { job, draft };
}
function loadedPlanStore(record = acceptedPlan()) {
  const storedEntries = signal<readonly MarketplaceEntry[]>([]);
  const snapshot = computed(() => ({ publications: { items: storedEntries() } }));
  const selectedConnection = signal<MarketplaceConnection>({
    ...accountA,
    connectionId: record.job.connectionId!,
    externalAccountId: record.job.externalAccountId,
  });
  const listPlans = vi.fn().mockResolvedValue([record]);
  const reloadImportedSnapshot = vi.fn().mockResolvedValue(true);
  const load = vi.fn().mockResolvedValue({
    ...record.draft,
    revision: 2,
    content: { ...record.draft.content, title: 'Nicht beauftragt', priceCents: 2500 },
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: signal({ id: 'plan-user' }) } },
      {
        provide: MarketplaceAccountStore,
        useValue: {
          selectedConnection,
          canManage: signal(true),
          reloadImportedSnapshot,
          snapshot,
        },
      },
      {
        provide: VintedListingJobService,
        useValue: { listPlans, listen: vi.fn(() => () => undefined) },
      },
      {
        provide: WorkspaceService,
        useValue: { currentWorkspace: signal({ id: accountA.workspaceId }) },
      },
      { provide: VintedListingDraftService, useValue: { load } },
      {
        provide: VintedListingImageService,
        useValue: { thumbnailUrls: vi.fn().mockResolvedValue(new Map()) },
      },
    ],
  });
  const plans = TestBed.runInInjectionContext(() => new VintedRelistingPlanStore());
  return { plans, listPlans, load, reloadImportedSnapshot, selectedConnection, storedEntries };
}
it('hält die bestätigte Jobannahme über verspätete und fehlgeschlagene erste Planabrufe bis zum Serverplan gesperrt', async () => {
  const record = acceptedPlan();
  const f = loadedPlanStore(record);
  f.listPlans.mockResolvedValue([]);
  await settlePlans();
  const source = parseMarketplacePage(
    {
      items: [
        {
          ...accountA,
          connectionId: record.job.connectionId!,
          id: '46300000-0000-4000-8000-000000000099',
          externalId: '123',
          title: 'Quelle',
        },
      ],
      total: 1,
      nextCursor: null,
    },
    { ...accountA, connectionId: record.job.connectionId! },
  ).items[0]!;
  const operations = TestBed.inject(VintedListingOperationStore);
  operations.acceptRelisting(source, record.job, record.draft, 'plan-user');
  await settlePlans();
  expect(f.plans.plans()[0]?.job.id).toBe(record.job.id);
  expect(f.listPlans).toHaveBeenCalledTimes(2);
  f.listPlans.mockRejectedValue(new Error('offline'));
  await f.plans.refresh();
  expect(f.plans.plans()).toHaveLength(1);
  expect(operations.acceptedRelistings()).toHaveLength(1);
  f.selectedConnection.set(accountB);
  await settlePlans();
  expect(f.plans.plans()).toEqual([]);
  f.listPlans.mockResolvedValue([{ ...record, job: { ...record.job, state: 'failed' } }]);
  f.selectedConnection.set({ ...accountA, connectionId: record.job.connectionId! });
  await settlePlans();
  expect(f.plans.plans()[0]?.job.state).toBe('failed');
  expect(operations.acceptedRelistings()).toEqual([]);
});
it('stellt die angenommene Aufnahme dar, auch wenn ein neuerer Entwurf nicht beauftragt wurde', async () => {
  const f = loadedPlanStore();
  await settlePlans();
  expect(f.plans.plans()[0]?.draft.content.title).toBe('Beauftragte Jacke');
  expect(f.plans.plans()[0]?.draft.content.priceCents).toBe(2000);
  expect(f.load).not.toHaveBeenCalled();
});
it('zeigt vor dem Löschbeleg nur Vorbereitung und erfindet keine relative Restzeit', async () => {
  const record = acceptedPlan();
  const f = loadedPlanStore({
    ...record,
    job: {
      ...record.job,
      scheduledAt: null,
      timeZone: null,
      relistDelaySeconds: 300,
      relistDeletedAt: null,
    },
  });
  await settlePlans();
  expect(f.plans.plans()[0]?.label).toBe('Wird vorbereitet');
  expect(f.plans.canEdit(f.plans.plans()[0]!.job)).toBe(false);
  expect(f.plans.canEdit({ ...f.plans.plans()[0]!.job, state: 'failed' })).toBe(true);
  expect(f.plans.canEdit({ ...f.plans.plans()[0]!.job, state: 'cancelled' })).toBe(false);
  expect(
    f.plans.canEdit({
      ...f.plans.plans()[0]!.job,
      state: 'cancelled',
      relistDeletedAt: '2026-11-03T12:00:00Z',
    }),
  ).toBe(true);
});
it('zählt auf dem vorhandenen Takt weiter und behauptet beim Termin noch keine Ausführung', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
  const record = acceptedPlan();
  const f = loadedPlanStore({
    ...record,
    job: { ...record.job, scheduledAt: '2026-11-03T12:05:00Z' },
  });
  await settlePlans();
  expect(f.plans.plans()[0]?.label).toBe('Wird in 5 Minuten relistet');
  // Eine verzögerte Backendantwort darf die bereits sichtbare Restzeit nicht einfrieren.
  f.listPlans.mockImplementation(() => new Promise(() => undefined));
  vi.advanceTimersByTime(180_000);
  await settlePlans();
  expect(f.plans.plans()[0]?.label).toBe('Wird in 2 Minuten relistet');
  vi.advanceTimersByTime(120_000);
  await settlePlans();
  expect(f.plans.plans()[0]?.label).toBe('Wartet auf den Start');
  expect(f.listPlans).toHaveBeenCalledTimes(2);
});
it.each([
  ['claimed', null, 'Wird vorbereitet'],
  ['writing', null, 'Wird vorbereitet'],
  ['claimed', '2026-11-03T12:00:00Z', 'Wird vorbereitet'],
  ['writing', '2026-11-03T12:00:00Z', 'Wird inseriert'],
] as const)(
  'zeigt tatsächliche Ausführung %s nach Löschung %s und sperrt die Planbearbeitung',
  async (state, relistDeletedAt, label) => {
    const record = acceptedPlan();
    const f = loadedPlanStore({ ...record, job: { ...record.job, state, relistDeletedAt } });
    await settlePlans();
    expect(f.plans.plans()[0]?.label).toBe(label);
    expect(f.plans.canEdit(f.plans.plans()[0]!.job)).toBe(false);
  },
);
it('bindet dieselbe Karte vor Löschung, bei Fehlern und bis zum neuen importierten Inserat dauerhaft an die Entry-ID', () => {
  const { component } = setup('');
  const stableId = '46300000-0000-4000-8000-000000000099';
  const page = parseMarketplacePage(
    {
      items: [
        { ...accountA, id: 'before', externalId: '122', title: 'Vorher' },
        {
          ...accountA,
          id: stableId,
          externalId: '123',
          title: 'Quelle',
          metrics: { views: 80, favorites: 9, observedAt: '2026-11-03T12:00:00Z' },
          publishedAt: '2026-10-01T12:00:00Z',
        },
        { ...accountA, id: 'after', externalId: '124', title: 'Nachher' },
      ],
      total: 3,
      nextCursor: null,
    },
    accountA,
  );
  const currentPage = signal(page);
  vi.spyOn(component, 'page').mockImplementation(() => currentPage());
  const record = acceptedPlan();
  const plan = {
    ...record,
    job: {
      ...record.job,
      connectionId: accountA.connectionId,
      relistEntryId: stableId,
      state: 'claimed' as const,
      scheduledAt: null,
      timeZone: null,
      relistDeletedAt: null,
    },
    imageUrl: null,
    label: 'Wird vorbereitet',
  };
  component.plans.plans.set([plan]);
  TestBed.tick();
  expect(component.tableRows().map((row) => row.entry.id)).toEqual(['before', stableId, 'after']);
  expect(component.actionsBlocked(component.tableRows()[1]!.entry)).toBe(true);
  component.plans.plans.set([
    { ...plan, job: { ...plan.job, state: 'failed' }, label: 'Fehlgeschlagen' },
  ]);
  currentPage.set({ ...page, items: [page.items[0]!, page.items[2]!] });
  TestBed.tick();
  expect(component.tableRows().map((row) => row.entry.id)).toEqual(['before', stableId, 'after']);
  expect(component.actionsBlocked(component.tableRows()[1]!.entry)).toBe(true);
  const imported = {
    ...page.items[1]!,
    id: 'temporary-new-cache-entry',
    externalId: '456',
    metrics: { views: 2, favorites: 1, observedAt: '2026-11-03T13:00:00Z' },
    publishedAt: '2026-11-03T13:00:00Z',
    createdAt: '2026-11-03T13:00:00Z',
  };
  component.plans.plans.set([
    {
      ...plan,
      job: {
        ...plan.job,
        state: 'confirmed',
        externalId: '456',
        relistDeletedAt: '2026-11-03T12:55:00Z',
      },
      label: 'Veröffentlicht',
    },
  ]);
  currentPage.set({ ...page, items: [...page.items, imported] });
  TestBed.tick();
  expect(component.tableRows().map((row) => row.entry.id)).toEqual(['before', stableId, 'after']);
  expect(component.tableRows()[1]?.entry).toMatchObject({
    externalId: '456',
    metrics: imported.metrics,
    publishedAt: imported.publishedAt,
  });
  expect(component.actionsBlocked(component.tableRows()[1]!.entry)).toBe(true);
  currentPage.set({
    ...page,
    items: [page.items[0]!, { ...imported, id: stableId }, page.items[2]!],
  });
  component.plans.plans.set([]);
  TestBed.tick();
  expect(component.tableRows().map((row) => row.entry.id)).toEqual(['before', stableId, 'after']);
  expect(component.tableRows()[1]?.entry.metrics).toEqual(imported.metrics);
});

it('verwendet die servergebundene Entry-ID auch ohne flüchtige Quellkarte', () => {
  const { component } = setup('');
  const record = acceptedPlan();
  const stableId = '46300000-0000-4000-8000-000000000099';
  component.plans.plans.set([
    {
      ...record,
      job: {
        ...record.job,
        connectionId: accountA.connectionId,
        relistEntryId: stableId,
        state: 'failed',
      },
      imageUrl: null,
      label: 'Fehlgeschlagen',
    },
  ]);
  TestBed.tick();
  expect(component.tableRows()[0]?.entry.id).toBe(stableId);
  expect(component.actionsBlocked(component.tableRows()[0]!.entry)).toBe(true);
});
it('sperrt die angenommene Übergabe schon vor dem nächsten Component-Takt gegen normale Aktionen', () => {
  const { component } = setup('');
  const record = acceptedPlan();
  const entry = parseMarketplacePage(
    {
      items: [
        {
          ...accountA,
          id: '46300000-0000-4000-8000-000000000099',
          externalId: '123',
          title: 'Quelle',
        },
      ],
      total: 1,
      nextCursor: null,
    },
    accountA,
  ).items[0]!;
  const job = { ...record.job, connectionId: entry.connectionId, relistEntryId: entry.id };
  component.operations.acceptRelisting(
    entry,
    job,
    { ...record.draft, connectionId: entry.connectionId },
    'price-user',
  );
  expect(component.plans.plans()).toEqual([]);
  expect(component.actionsBlocked(entry)).toBe(true);
  component.openEditor(entry, 'template');
  component.changePrice(entry, new MouseEvent('click'));
  expect(component.editorSource()).toBeNull();
  expect(component.priceEditor.open()).toBe(false);
});
it('erhält Artikelstand und Position von Vorbereitung über Planung bis zur Ausführung kontogebunden', async () => {
  const { component, store } = setup('');
  const page = parseMarketplacePage(
    {
      items: ['vorher', 'quelle', 'nachher'].map((id, index) => ({
        ...accountA,
        id,
        externalId: String(123 + index),
        title: id,
        price: 20,
        currency: 'EUR',
        publicationState: 'active',
        brand: 'Marke',
        size: 'M',
      })),
      total: 3,
      nextCursor: null,
    },
    accountA,
  );
  const currentPage = signal(page);
  vi.spyOn(component, 'page').mockImplementation(() => currentPage());
  TestBed.tick();
  const source = page.items[1]!;
  expect(component.tableRows().map((row) => row.entry.id)).toEqual(['vorher', 'quelle', 'nachher']);
  let finish!: () => void;
  const preparing = component.operations.prepareRelisting(
    source,
    () => new Promise<void>((resolve) => (finish = resolve)),
  );
  expect(component.actionsVisible(source)).toBe(true);
  expect(component.priceActionVisible(source)).toBe(true);
  expect(component.canCreateFrom(source)).toBe(false);
  expect(component.tableRows()[1]?.running).toBe(true);
  expect(component.isPreparingRelisting(source)).toBe(true);
  component.openEditor(source, 'template');
  component.changePrice(source, new MouseEvent('click'));
  expect(component.editorSource()).toBeNull();
  expect(component.priceEditor.open()).toBe(false);
  finish();
  await preparing;
  component.changePrice(source, new MouseEvent('click'));
  component.priceEditor.control.setValue(25);
  expect(component.priceEditor.open()).toBe(true);
  const record = acceptedPlan();
  const plan = {
    ...record,
    job: {
      ...record.job,
      workspaceId: source.workspaceId,
      connectionId: source.connectionId,
      relistExternalId: source.externalId!,
    },
    draft: { ...record.draft, connectionId: source.connectionId },
    imageUrl: null,
    label: 'Wird in 5 Minuten relistet',
  };
  component.plans.plans.set([plan]);
  await component.savePrice();
  expect(store.saveListingPrice).not.toHaveBeenCalled();
  TestBed.tick();
  expect(component.priceEditor.open()).toBe(false);
  currentPage.set({ ...page, items: [page.items[0]!, page.items[2]!] });
  TestBed.tick();
  const rows = component.tableRows();
  expect(rows.map((row) => row.entry.id)).toEqual(['vorher', 'quelle', 'nachher']);
  expect(rows[1]?.entry).toMatchObject({
    brand: 'Marke',
    size: 'M',
    title: plan.draft.content.title,
  });
  expect(rows[1]?.running).toBe(false);
  expect(component.actionsBlocked(rows[1]!.entry)).toBe(true);
  currentPage.set({
    ...page,
    items: [page.items[0]!, { ...source, id: 'reimported-source' }, page.items[2]!],
  });
  TestBed.tick();
  expect(component.tableRows().map((row) => row.entry.id)).toEqual([
    'vorher',
    'reimported-source',
    'nachher',
  ]);
  component.plans.plans.set([
    { ...plan, job: { ...plan.job, state: 'writing' }, label: 'Wird inseriert' },
  ]);
  TestBed.tick();
  expect(component.tableRows()[1]?.running).toBe(true);
  expect(component.tableRows()[1]?.runningLabel).toBe('Wird inseriert');
  store.selectedConnection.set(accountB);
  expect(component.tableRows()).toEqual([]);
  TestBed.tick();
  expect(component.tableRows()).toEqual([]);
});
it('öffnet einen inzwischen gestarteten Plan auch bei einem verspäteten Bearbeitungsklick nicht', () => {
  const { component } = setup('');
  const record = acceptedPlan();
  const entry = parseMarketplacePage(
    {
      items: [{ ...accountA, id: 'source', externalId: '123', title: 'Quelle' }],
      total: 1,
      nextCursor: null,
    },
    accountA,
  ).items[0]!;
  const plan = {
    ...record,
    job: { ...record.job, workspaceId: entry.workspaceId, connectionId: entry.connectionId },
    imageUrl: null,
    label: 'Geplant',
  };
  component.plans.plans.set([plan]);
  component.editPlan(entry, plan);
  expect(component.editingPlan()).toEqual(plan.job);
  component.editingPlan.set(null);
  component.plans.plans.set([{ ...plan, job: { ...plan.job, state: 'writing' } }]);
  component.editPlan(entry, plan);
  expect(component.editingPlan()).toBeNull();
});
it('hält den Preis-Aktionsplatz bei fehlendem Listenpreis sichtbar und verwendet vorhandene Details zum Relisten', () => {
  const { component } = setup('');
  const page = parseMarketplacePage(
    {
      items: [
        {
          ...accountA,
          id: 'source',
          externalId: '123',
          title: 'Quelle',
          price: null,
          currency: 'EUR',
          publicationState: 'active',
        },
      ],
      total: 1,
      nextCursor: null,
    },
    accountA,
  );
  const entry = {
    ...page.items[0]!,
    listingContent: {
      ...emptyVintedListingContent(),
      title: 'Quelle',
      categoryId: 2738,
      categoryLabel: 'Fußballschuhe',
      priceCents: 2000,
    },
  };
  vi.spyOn(component, 'page').mockReturnValue({ ...page, items: [entry] });
  TestBed.tick();
  expect(vintedListingSourceContent(entry).priceCents).toBe(2000);
  expect(component.canCreateFrom(entry)).toBe(true);
  expect(component.priceActionVisible(entry)).toBe(true);
  expect(component.priceEditor.available(entry)).toBe(false);
  component.changePrice(entry, new MouseEvent('click'));
  expect(component.priceEditor.open()).toBe(false);
});
it('entfernt die bestätigte Karte erst nach erfolgreichem Laden der neuen Lesekopie', async () => {
  const record = acceptedPlan();
  const confirmed = {
    ...record,
    job: { ...record.job, state: 'confirmed' as const, externalId: '456' },
  };
  const f = loadedPlanStore(confirmed);
  await settlePlans();
  expect(f.plans.plans()).toHaveLength(1);
  f.listPlans.mockResolvedValue([]);
  f.reloadImportedSnapshot.mockResolvedValue(false);
  await f.plans.refresh();
  expect(f.plans.plans()).toHaveLength(1);
  f.reloadImportedSnapshot.mockResolvedValue(true);
  await f.plans.refresh();
  expect(f.plans.plans()).toHaveLength(0);
});
it('blendet beim bestätigten Übergang alte und neue Cachekarte aus, bis die neue Lesekopie übernommen ist', () => {
  const { component, store } = setup('');
  const record = acceptedPlan();
  const old = parseMarketplacePage(
    {
      items: [
        { ...accountA, id: 'old', externalId: '123', title: 'Alt' },
        { ...accountA, id: 'new', externalId: '456', title: 'Neu' },
      ],
      total: 2,
      nextCursor: null,
    },
    accountA,
  );
  const currentPage = signal(old);
  vi.spyOn(component, 'page').mockImplementation(() => currentPage());
  component.plans.plans.set([
    {
      ...record,
      job: {
        ...record.job,
        connectionId: accountA.connectionId,
        state: 'confirmed',
        externalId: '456',
      },
      imageUrl: null,
      label: 'Veröffentlicht',
    },
  ]);
  TestBed.tick();
  expect(component.entries()).toEqual([]);
  expect(component.tableRows().map((row) => row.entry.externalId)).toEqual(['456']);
  expect(component.tableRows()[0]?.plan?.job.state).toBe('confirmed');
  component.plans.plans.set([]);
  currentPage.set({ ...old, items: [old.items[1]!] });
  TestBed.tick();
  expect(component.entries().map((entry) => entry.externalId)).toEqual(['456']);
  expect(component.tableRows().map((row) => row.entry.externalId)).toEqual(['456']);
  expect(store.selectedConnection().connectionId).toBe(accountA.connectionId);
});

it('führt eine Löschung nur nach Bestätigung aus und behält ihren Fehler in den laufenden Aktionen', async () => {
  const { component, store } = setup('');
  TestBed.tick();
  const entry = parseMarketplacePage(
    {
      items: [
        {
          ...accountA,
          id: 'delete-1',
          externalId: '98765',
          title: 'Schal',
          publicationState: 'active',
        },
      ],
      total: 1,
      nextCursor: null,
    },
    accountA,
  ).items[0];
  const confirm = TestBed.inject(ConfirmDialogService);
  const rejected = component.deleteListing(entry);
  confirm.antworte(false);
  await rejected;
  expect(store.deleteListing).not.toHaveBeenCalled();
  store.deleteListing.mockRejectedValueOnce(new Error('Nicht bestätigt'));
  const deleting = component.deleteListing(entry);
  confirm.antworte(true);
  await deleting;
  expect(store.deleteListing).toHaveBeenCalledWith(accountA.connectionId, entry.id);
  expect(component.operations.entries()[0]).toMatchObject({
    kind: 'delete',
    state: 'error',
    message: 'Nicht bestätigt',
  });
  const retry = component.deleteListing(entry);
  confirm.antworte(true);
  await retry;
  expect(TestBed.inject(ToastService).toasts()).toMatchObject([
    { type: 'success', title: 'Inserat erfolgreich gelöscht', description: 'Schal' },
  ]);
  expect(component.operations.entries().some((action) => action.state === 'success')).toBe(false);
});

it('übernimmt die neue gebundene Karte vor dem Abschluss und verwirft ältere Planantworten', async () => {
  const initial = acceptedPlan();
  const originalId = '46900000-0000-4000-8000-000000000041';
  const record = {
    ...initial,
    job: { ...initial.job, relistEntryId: originalId, state: 'writing' as const, version: 2 },
  };
  const f = loadedPlanStore(record);
  await settlePlans();
  const operations = TestBed.inject(VintedListingOperationStore);
  const publishedAt = new Date().toISOString();
  const confirmed = {
    ...record.job,
    state: 'confirmed' as const,
    version: 3,
    externalId: '10672542627',
    providerState: 'active' as const,
    verifiedAt: publishedAt,
    updatedAt: publishedAt,
  };
  const imported = parseMarketplacePage(
    {
      items: [
        {
          ...accountA,
          connectionId: record.job.connectionId,
          id: originalId,
          externalId: confirmed.externalId,
          title: 'EA7',
          publicationState: 'active',
          occurredAt: publishedAt,
        },
      ],
      total: 1,
      nextCursor: null,
    },
    { ...accountA, connectionId: record.job.connectionId ?? '' },
  ).items;
  let finishSnapshot: (() => void) | undefined;
  f.reloadImportedSnapshot.mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finishSnapshot = resolve;
    });
    f.storedEntries.set(imported);
    return true;
  });
  const completion = operations.synchronizeRelisting(confirmed);
  await settlePlans();
  expect(f.plans.plans()[0]?.job.state).toBe('writing');
  finishSnapshot?.();
  expect(await completion).toBe(true);
  expect(f.storedEntries()).toHaveLength(1);
  expect(f.storedEntries()[0]?.id).toBe(originalId);
  expect(f.storedEntries()[0]?.publishedAt).toBe(publishedAt);
  expect(f.plans.plans()[0]?.job.state).toBe('confirmed');
  await f.plans.refresh();
  expect(f.plans.plans()[0]?.job.state).toBe('confirmed');
});

it('hält den Abschluss bei fehlender neuer Karte zurück und verwendet nach Kontowechsel keine späte Antwort', async () => {
  const record = acceptedPlan();
  const f = loadedPlanStore(record);
  await settlePlans();
  const operations = TestBed.inject(VintedListingOperationStore);
  const confirmed = {
    ...record.job,
    state: 'confirmed' as const,
    version: 2,
    externalId: '10672542627',
    providerState: 'active' as const,
    verifiedAt: new Date().toISOString(),
  };
  expect(await operations.synchronizeRelisting(confirmed)).toBe(false);
  expect(f.plans.plans()[0]?.job.state).toBe('queued');
  const reads = f.reloadImportedSnapshot.mock.calls.length;
  expect(await operations.synchronizeRelisting({ ...confirmed, externalAccountId: '999' })).toBe(
    false,
  );
  expect(f.reloadImportedSnapshot).toHaveBeenCalledTimes(reads);
  let finish: ((ready: boolean) => void) | undefined;
  f.reloadImportedSnapshot.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const completion = operations.synchronizeRelisting(confirmed);
  await settlePlans();
  f.listPlans.mockResolvedValue([]);
  f.selectedConnection.set({ ...accountB, externalAccountId: '456' });
  await settlePlans();
  finish?.(true);
  expect(await completion).toBe(true);
  expect(f.plans.plans()).toEqual([]);
});

it('öffnet die Bearbeiten-Maske direkt aus der Inseratliste', () => {
  const { component, store } = setup('');
  store.selectedConnection.set({ ...accountA, status: 'connected', executionMode: 'cloud' });
  TestBed.tick();
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
  const entry = parseMarketplacePage(
    {
      items: [
        {
          ...accountA,
          id: 'edit-1',
          externalId: '9001',
          title: 'Jeans',
          publicationState: 'active',
        },
      ],
      total: 1,
      nextCursor: null,
    },
    accountA,
  ).items[0];
  component.editListing(entry);
  expect(navigate).toHaveBeenCalledWith(
    ['/marketplaces/vinted/listings', accountA.connectionId, 'edit-1'],
    { queryParams: { edit: 1 } },
  );
  store.canManage.set(false);
  navigate.mockClear();
  component.editListing(entry);
  expect(navigate).not.toHaveBeenCalled();
});
