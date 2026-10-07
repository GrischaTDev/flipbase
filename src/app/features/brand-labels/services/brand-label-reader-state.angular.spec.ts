import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { WorkspaceAccessService } from '../../../core/services/workspace-access.service';
import { PlatformOperatorService } from '../../../core/services/platform-operator.service';
import { readerCard, readerDetail, readerPage } from '../test-support/label-reader.fixtures';
import { BrandLabelReaderService, LabelReadError } from './brand-label-reader.service';
import { BrandLabelReaderState } from './brand-label-reader-state';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function settle() {
  TestBed.tick();
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
const filter = { brandSlug: 'nike', query: '', decade: null, kind: null } as const;
function setup() {
  const user = signal<{ id: string } | null>({ id: 'user-a' });
  const workspace = signal<{ id: string } | null>({ id: 'workspace-a' });
  const access = signal([{ workspace_id: 'workspace-a', access_status: 'active' }]);
  const operator = signal(false);
  const service = {
    availability: vi.fn().mockResolvedValue({ visible: true, operator: false }),
    list: vi.fn().mockResolvedValue(readerPage()),
    detail: vi.fn().mockResolvedValue(null),
  };
  TestBed.configureTestingModule({
    providers: [
      BrandLabelReaderState,
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: WorkspaceService, useValue: { currentWorkspace: workspace } },
      { provide: WorkspaceAccessService, useValue: { access } },
      { provide: PlatformOperatorService, useValue: { operator } },
      { provide: BrandLabelReaderService, useValue: service },
    ],
  });
  return {
    state: TestBed.inject(BrandLabelReaderState),
    service,
    user,
    workspace,
    access,
    operator,
  };
}
describe('Label-Leserzustand', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('lädt nach bestätigter Verfügbarkeit eine echte leere Sammlung', async () => {
    const { state, service } = setup();
    service.list.mockResolvedValueOnce(readerPage(0));
    state.search(filter);
    await settle();
    expect(state.view().phase).toBe('ready');
    expect(state.view().page?.items).toEqual([]);
  });
  it('ruft bei geschlossenem Zugang keine Labeldaten ab', async () => {
    const { state, service } = setup();
    service.availability.mockResolvedValueOnce({ visible: false, operator: false });
    state.search(filter);
    await settle();
    expect(state.view().phase).toBe('unavailable');
    expect(service.list).not.toHaveBeenCalled();
  });
  it('lässt eine langsame alte Suche die neue Suche nicht überschreiben', async () => {
    const { state, service } = setup();
    const first = deferred<ReturnType<typeof readerPage>>();
    service.list.mockReturnValueOnce(first.promise);
    state.search(filter);
    await settle();
    state.search({ ...filter, query: 'neue Suche' });
    await settle();
    expect(state.view().page?.items[0]?.referenceId).toBe(1);
    first.resolve({ ...readerPage(), items: [readerCard(9)] });
    await settle();
    expect(state.view().page?.items[0]?.referenceId).toBe(1);
  });
  it('verhindert alte Ergebnisse und Nachladen zwischen Filteränderung und Effect', async () => {
    const { state, service } = setup();
    service.list.mockResolvedValueOnce(readerPage(24));
    state.search(filter);
    await settle();
    state.search({ ...filter, query: 'neue Suche' });
    expect(state.view().page).toBeNull();
    expect(state.view().phase).toBe('loading');
    await state.more();
    expect(service.list).toHaveBeenCalledTimes(1);
  });
  it('verbirgt den alten Detailtitel unmittelbar nach einem Routenwechsel', async () => {
    const { state, service } = setup();
    service.detail.mockResolvedValueOnce(readerDetail());
    state.show('testmarke', 'testetikett-1');
    await settle();
    expect(state.view().detail?.title).toBe('Testetikett 1');
    state.show('testmarke', 'anderes-label');
    expect(state.view().detail).toBeNull();
    expect(state.view().phase).toBe('loading');
  });
  it('entfernt Ergebnisse beim Abmelden synchron, nicht erst nach dem nächsten Effect', async () => {
    const { state, user, service } = setup();
    state.search(filter);
    await settle();
    expect(state.view().page?.items).toHaveLength(1);
    user.set(null);
    expect(state.view().page).toBeNull();
    await settle();
    expect(state.view().phase).toBe('unavailable');
    expect(service.list).toHaveBeenCalledTimes(1);
  });
  it('ignoriert eine Antwort nach Workspacewechsel und entzogenem Zugang', async () => {
    const { state, workspace, service } = setup();
    const pending = deferred<ReturnType<typeof readerPage>>();
    service.list.mockReturnValueOnce(pending.promise);
    state.search(filter);
    await settle();
    workspace.set({ id: 'workspace-b' });
    pending.resolve(readerPage());
    await settle();
    expect(state.view().page).toBeNull();
    expect(state.view().phase).toBe('unavailable');
  });
  it('entfernt vorhandene Ergebnisse bei abgelaufenem Workspacezugang', async () => {
    const { state, access } = setup();
    state.search(filter);
    await settle();
    access.set([{ workspace_id: 'workspace-a', access_status: 'expired' }]);
    expect(state.view().page).toBeNull();
    await settle();
    expect(state.view().phase).toBe('unavailable');
  });
  it('lädt eine Folgeseite nur einmal und hängt sie bei gleicher Katalogversion an', async () => {
    const { state, service } = setup();
    service.list.mockResolvedValueOnce(readerPage(24));
    state.search(filter);
    await settle();
    const next = deferred<ReturnType<typeof readerPage>>();
    service.list.mockReturnValueOnce(next.promise);
    const loading = state.more();
    await state.more();
    expect(service.list).toHaveBeenCalledTimes(2);
    expect(service.list).toHaveBeenLastCalledWith(filter, 24);
    next.resolve({ items: [readerCard(25)], hasMore: false, catalogVersion: '7' });
    await loading;
    expect(state.view().page?.items).toHaveLength(25);
  });
  it('startet bei einer geänderten Sammlung wieder auf Seite eins statt Versionen zu mischen', async () => {
    const { state, service } = setup();
    service.list.mockResolvedValueOnce(readerPage(24));
    state.search(filter);
    await settle();
    service.list.mockResolvedValueOnce({
      items: [readerCard(25)],
      hasMore: false,
      catalogVersion: '8',
    });
    service.list.mockResolvedValueOnce({
      items: [readerCard(90)],
      hasMore: false,
      catalogVersion: '8',
    });
    await state.more();
    expect(state.view().page?.items.map((entry) => entry.referenceId)).toEqual([90]);
    expect(state.view().notice).toMatch(/aktualisiert/);
    expect(service.list).toHaveBeenLastCalledWith(filter, 0);
  });
  it('behandelt ein inzwischen entferntes Detail als nicht verfügbar, nicht als Fälschung', async () => {
    const { state, service } = setup();
    state.show('testmarke', 'entfernt');
    await settle();
    expect(service.detail).toHaveBeenCalledWith('testmarke', 'entfernt');
    expect(state.view().phase).toBe('ready');
    expect(state.view().detail).toBeNull();
  });
  it('leert den Leserstand bei einem serverseitigen Rechteentzug', async () => {
    const { state, service } = setup();
    service.list.mockResolvedValueOnce(readerPage(24));
    state.search(filter);
    await settle();
    service.list.mockRejectedValueOnce(new LabelReadError('unavailable'));
    await state.more();
    expect(state.view().page).toBeNull();
    expect(state.view().phase).toBe('unavailable');
  });
  it('verwirft ausstehende Antworten nach Zerstörung der Seite', async () => {
    const { state, service } = setup();
    const pending = deferred<ReturnType<typeof readerPage>>();
    service.list.mockReturnValueOnce(pending.promise);
    state.search(filter);
    await settle();
    TestBed.resetTestingModule();
    pending.resolve(readerPage());
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(state.view().page).toBeNull();
  });
});
