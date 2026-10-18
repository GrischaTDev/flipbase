import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { SalePlatformsService } from './sale-platforms.service';

function fixture() {
  const currentWorkspace = signal({ id: 'a' });
  const service = Object.create(SalePlatformsService.prototype) as SalePlatformsService;
  const rpc = vi.fn();
  const read = vi.fn();
  const release = vi.fn();
  const savedPlatforms = signal([{ value: 'old', label: 'Alter Stand' }]);
  Object.assign(service, {
    workspace: { currentWorkspace },
    supabase: {
      client: {
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: read }) }) }),
        rpc,
      },
    },
    context: { acquire: () => release },
    savedPlatforms,
    version: 0,
    loadRequest: 0,
    loadedWorkspaceId: signal<string | null>(null),
    loading: signal(false),
    saving: signal(false),
    error: signal<string | null>(null),
  });
  return { service, currentWorkspace, rpc, read, release, savedPlatforms };
}

describe('Gespeicherte Verkaufsplattformen', () => {
  it('behält bei einem fehlgeschlagenen Neuladen den bestätigten Stand desselben Workspace', async () => {
    const f = fixture();
    f.read.mockResolvedValueOnce({
      data: { platforms: [{ value: 'custom:a', label: 'Oza' }], version: 2 },
      error: null,
    });
    await f.service.reload();
    f.read.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await f.service.reload();
    expect(f.savedPlatforms()).toEqual([{ value: 'custom:a', label: 'Oza' }]);
    expect(f.service.loadedWorkspaceId()).toBe('a');
    expect(f.service.error()).toBeTruthy();
  });
  it('ignoriert eine verspätete Antwort aus dem vorherigen Workspace', async () => {
    const f = fixture();
    let resolveA!: (value: unknown) => void;
    f.read
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveA = resolve;
        }),
      )
      .mockResolvedValueOnce({
        data: { platforms: [{ value: 'b', label: 'B' }], version: 3 },
        error: null,
      });
    const loadingA = f.service.reload('a');
    expect(f.savedPlatforms()).toEqual([]);
    f.currentWorkspace.set({ id: 'b' });
    await f.service.reload('b');
    resolveA({ data: { platforms: [{ value: 'a', label: 'A' }], version: 1 }, error: null });
    await loadingA;
    expect(f.savedPlatforms()).toEqual([{ value: 'b', label: 'B' }]);
    expect(f.service.loadedWorkspaceId()).toBe('b');
  });
  it('bestätigt die neue Reihenfolge erst nach erfolgreicher Speicherung und gibt die Versionsnummer mit', async () => {
    const f = fixture();
    f.read.mockResolvedValue({
      data: { platforms: [{ value: 'vinted', label: 'Vinted' }], version: 3 },
      error: null,
    });
    await f.service.reload();
    const next = [{ value: 'vinted', label: 'Mein Vinted' }];
    f.rpc.mockResolvedValueOnce({ data: { platforms: next, version: 4 }, error: null });
    expect(await f.service.save(next)).toBeNull();
    expect(f.rpc).toHaveBeenCalledWith('save_sale_platforms', {
      p_workspace_id: 'a',
      p_platforms: next,
      p_expected_version: 3,
    });
    expect(f.savedPlatforms()).toEqual(next);
    expect(f.release).toHaveBeenCalledOnce();
  });
  it('behält bei Rechte- oder Versionsfehlern den bestätigten Stand', async () => {
    const f = fixture();
    f.service.loadedWorkspaceId.set('a');
    f.rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'Bitte neu laden.' } });
    expect(await f.service.save([{ value: 'new', label: 'Neu' }])).toBe('Bitte neu laden.');
    expect(f.savedPlatforms()).toEqual([{ value: 'old', label: 'Alter Stand' }]);
    expect(f.service.saving()).toBe(false);
  });
  it('schreibt nach einem Ladefehler keine Standardliste über gespeicherte Daten', async () => {
    const f = fixture();
    f.read.mockResolvedValue({ data: null, error: new Error('offline') });
    await f.service.reload();
    expect(await f.service.save([{ value: 'new', label: 'Neu' }])).toContain('vollständig laden');
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
