import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerStorageState } from './server-storage-state';
import { ServerStorageService, ServerStorageStatus } from './server-storage.service';

const measuredStorage: ServerStorageStatus = {
  id: 1,
  total_bytes: 80 * 1024 ** 3,
  used_bytes: 44 * 1024 ** 3,
  available_bytes: 32 * 1024 ** 3,
  reported_at: '2026-10-06T20:00:00.000Z',
};

describe('ServerStorageState', () => {
  const service = { load: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(measuredStorage.reported_at));
    service.load.mockReset().mockResolvedValue(measuredStorage);
    TestBed.configureTestingModule({
      providers: [ServerStorageState, { provide: ServerStorageService, useValue: service }],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('berechnet verfügbare und reservierte GiB sowie den Prozentwert wie df', async () => {
    const state = TestBed.inject(ServerStorageState);
    await state.refresh();
    expect(state.totalGiB()).toBe(80);
    expect(state.usedGiB()).toBe(44);
    expect(state.availableGiB()).toBe(32);
    expect(state.reservedGiB()).toBe(4);
    expect(state.usedPercent()).toBeCloseTo((100 * 44) / 76);
    expect(state.status().tone).toBe('success');
  });

  it.each([
    [65, 11, 'caution'],
    [70, 6, 'critical'],
    [10, 4, 'critical'],
    [10, 9, 'caution'],
  ])('warnt bei %s GiB belegt und %s GiB frei', async (usedGiB, availableGiB, tone) => {
    service.load.mockResolvedValue({
      ...measuredStorage,
      used_bytes: usedGiB * 1024 ** 3,
      available_bytes: availableGiB * 1024 ** 3,
    });
    const state = TestBed.inject(ServerStorageState);
    await state.refresh();
    expect(state.status().tone).toBe(tone);
  });

  it('bestätigt alte Messwerte auch nach erneutem erfolgreichen Abruf nicht als aktuell', async () => {
    const state = TestBed.inject(ServerStorageState);
    await state.refresh();
    await vi.advanceTimersByTimeAsync(210_000);
    expect(service.load).toHaveBeenCalledTimes(4);
    expect(state.stale()).toBe(true);
    expect(state.status().label).toBe('Messstand unbestätigt');
  });

  it('behält bei Ladefehlern den letzten Stand mit Warnung und erholt sich beim nächsten Abruf', async () => {
    const state = TestBed.inject(ServerStorageState);
    await state.refresh();
    service.load.mockRejectedValueOnce(new Error('interne Verbindungsdetails'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.snapshot()).toEqual(measuredStorage);
    expect(state.error()).toBe('Der Speicherstand konnte nicht geladen werden.');
    expect(state.stale()).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.error()).toBeNull();
    expect(state.stale()).toBe(false);
  });

  it('zeigt eine fehlende erste Meldung ohne erfundene Werte', async () => {
    service.load.mockResolvedValue(null);
    const state = TestBed.inject(ServerStorageState);
    await state.refresh();
    expect(state.loaded()).toBe(true);
    expect(state.snapshot()).toBeNull();
  });

  it('verhindert überlappende Abrufe und beendet beide Timer beim Verlassen der Seite', async () => {
    let finish: ((snapshot: ServerStorageStatus) => void) | undefined;
    service.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const state = TestBed.inject(ServerStorageState);
    const pending = state.refresh();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(service.load).toHaveBeenCalledTimes(1);
    finish?.(measuredStorage);
    await pending;
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(service.load).toHaveBeenCalledTimes(1);
  });
});
