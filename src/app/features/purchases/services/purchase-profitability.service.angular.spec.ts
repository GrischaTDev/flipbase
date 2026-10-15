import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { PurchaseProfitabilityService } from './purchase-profitability.service';

const currentWorkspace = signal({ id: 'workspace-1' });
const range = vi.fn();
const eq = vi.fn();
beforeEach(() => {
  TestBed.resetTestingModule();
  currentWorkspace.set({ id: 'workspace-1' });
  range.mockReset();
  eq.mockReset();
  eq.mockReturnValue({ order: () => ({ range }) });
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      {
        provide: SupabaseService,
        useValue: { client: { from: () => ({ select: () => ({ eq }) }) } },
      },
    ],
  });
});

describe('PurchaseProfitabilityService', () => {
  it('erhält die Einkaufszuordnung eines Artikels über seine Einkaufsposition', async () => {
    range.mockResolvedValueOnce({
      data: [
        {
          id: 'sale',
          sale_lines: [
            {
              id: 'line',
              inventory_item: {
                id: 'item',
                purchase_id: null,
                purchase_line: { purchase_id: 'purchase-a' },
              },
            },
          ],
        },
      ],
      count: 1,
      error: null,
    });
    const service = TestBed.inject(PurchaseProfitabilityService);
    await service.loadSales('workspace-1');
    expect(service.sales()[0].lines?.[0].inventory_item?.purchase_id).toBe('purchase-a');
  });
  it('behandelt einen bestätigten leeren Verlauf als geladen', async () => {
    range.mockResolvedValueOnce({ data: [], count: 0, error: null });
    const service = TestBed.inject(PurchaseProfitabilityService);
    await service.loadSales('workspace-1');
    expect(service.sales()).toEqual([]);
    expect(service.loadedWorkspaceId()).toBe('workspace-1');
    expect(service.loadError()).toBeNull();
  });
  it('verlangt einen Vollständigkeitsnachweis statt eine gekürzte Antwort zu übernehmen', async () => {
    range.mockResolvedValueOnce({ data: [{ id: 'a' }], count: null, error: null });
    const service = TestBed.inject(PurchaseProfitabilityService);
    await service.loadSales('workspace-1');
    expect(service.loadedWorkspaceId()).toBeNull();
    expect(service.sales()).toEqual([]);
    expect(service.loadError()).toBeInstanceOf(Error);
  });
  it('lädt über die Servergrenze hinaus und veröffentlicht erst den vollständigen Stand', async () => {
    range.mockResolvedValueOnce({ data: [{ id: 'a', sale_lines: [] }], count: 2, error: null });
    range.mockResolvedValueOnce({ data: [{ id: 'b', sale_lines: [] }], count: 2, error: null });
    const service = TestBed.inject(PurchaseProfitabilityService);
    await service.loadSales('workspace-1');
    expect(service.sales().map((sale) => sale.id)).toEqual(['a', 'b']);
    expect(service.loadedWorkspaceId()).toBe('workspace-1');
    expect(eq).toHaveBeenCalledWith('workspace_id', 'workspace-1');
    expect(range.mock.calls).toEqual([
      [0, 199],
      [1, 200],
    ]);
  });
  it('zeigt bei einem Fehler auf einer Folgeseite keine unvollständigen Summen', async () => {
    range.mockResolvedValueOnce({ data: [{ id: 'a', sale_lines: [] }], count: 2, error: null });
    range.mockResolvedValueOnce({ data: null, count: null, error: new Error('offline') });
    const service = TestBed.inject(PurchaseProfitabilityService);
    await service.loadSales('workspace-1');
    expect(service.sales()).toEqual([]);
    expect(service.loadedWorkspaceId()).toBeNull();
    expect(service.loadError()).toBeInstanceOf(Error);
    expect(service.isLoading()).toBe(false);
  });
  it('verwirft eine verspätete Antwort nach einem Workspacewechsel', async () => {
    let resolve!: (value: unknown) => void;
    range.mockImplementationOnce(
      () =>
        new Promise((finish) => {
          resolve = finish;
        }),
    );
    const service = TestBed.inject(PurchaseProfitabilityService);
    const loading = service.loadSales('workspace-1');
    currentWorkspace.set({ id: 'workspace-2' });
    TestBed.flushEffects();
    resolve({ data: [{ id: 'old' }], count: 1, error: null });
    await loading;
    expect(service.sales()).toEqual([]);
    expect(service.loadedWorkspaceId()).toBeNull();
    expect(service.isLoading()).toBe(false);
  });
});
