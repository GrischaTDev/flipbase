import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceShopService } from './workspace-shop.service';
import { WorkspaceService } from './workspace.service';
import { SupabaseService } from './supabase.service';
import type { Workspace } from '../models/flipbase.models';

const row = (id = 'a', version = 0, enabled = false) =>
  ({ id, shop_enabled: enabled, shop_entitled: true, shop_version: version }) as Workspace;
const response = (id: string, version: number, enabled: boolean) => ({
  data: { workspace_id: id, shop_enabled: enabled, shop_entitled: true, shop_version: version },
  error: null,
});

describe('Shop-Einstellung', () => {
  const currentWorkspace = signal<Workspace | null>(null);
  const workspaces = signal<Workspace[]>([]);
  let rpc: ReturnType<typeof vi.fn>;
  let service: WorkspaceShopService;
  beforeEach(() => {
    currentWorkspace.set(row());
    workspaces.set([row()]);
    rpc = vi.fn(async () => response('a', 0, false));
    TestBed.configureTestingModule({
      providers: [
        WorkspaceShopService,
        { provide: WorkspaceService, useValue: { currentWorkspace, workspaces } },
        { provide: SupabaseService, useValue: { client: { rpc } } },
      ],
    });
    service = TestBed.inject(WorkspaceShopService);
  });
  afterEach(() => TestBed.resetTestingModule());
  it('lässt bei unverändertem Abgleich offene Ansichten und Workspace-Identität bestehen', async () => {
    const original = currentWorkspace();
    await service.refresh();
    expect(currentWorkspace()).toBe(original);
  });
  it('speichert mit Version und aktualisiert Navigation sowie Workspace-Liste', async () => {
    rpc.mockResolvedValueOnce(response('a', 1, true));
    expect(await service.setEnabled(true)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('set_workspace_shop_enabled', {
      p_workspace_id: 'a',
      p_enabled: true,
      p_expected_version: 0,
    });
    expect(service.active()).toBe(true);
    expect(workspaces()[0].shop_version).toBe(1);
  });
  it('übernimmt verspätete Antworten eines vorherigen Workspace nicht', async () => {
    let complete!: (value: ReturnType<typeof response>) => void;
    rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = service.refresh();
    currentWorkspace.set(row('b'));
    complete(response('a', 2, true));
    await pending;
    expect(currentWorkspace()?.id).toBe('b');
    expect(service.active()).toBe(false);
  });
  it('setzt eine neuere Version bei verspäteten Antworten nicht zurück', async () => {
    currentWorkspace.set(row('a', 3, true));
    await service.refresh();
    expect(currentWorkspace()?.shop_version).toBe(3);
    expect(service.active()).toBe(true);
  });
  it('lädt bei Versionskonflikten neu und erhält die konkrete Fehlermeldung', async () => {
    rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Die Einstellung wurde inzwischen geändert.' },
      })
      .mockResolvedValueOnce(response('a', 2, true));
    expect(await service.setEnabled(false)).toBe(false);
    expect(service.active()).toBe(true);
    expect(service.error()).toContain('inzwischen geändert');
    expect(service.saving()).toBe(false);
  });
});
