import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { BrandService } from './brand.service';

describe('BrandService – Markenverwaltung', () => {
  it('ersetzt bestehende Zuordnungen atomar und lädt die Marken danach neu', async () => {
    const rpc = vi.fn(async () => ({ data: { deleted: true, reassigned: 3 }, error: null }));
    const reload = vi.fn(async () => undefined);
    const service = Object.create(BrandService.prototype) as BrandService;
    Object.assign(service, {
      workspace: { currentWorkspace: signal({ id: 'workspace-1' }) },
      supabase: { client: { rpc } },
      reload,
    });

    const result = await service.replaceAndDelete('brand-old', 'brand-new');

    expect(result).toEqual({ data: { deleted: true, reassigned: 3 }, error: null });
    expect(rpc).toHaveBeenCalledWith('replace_and_delete_brand', {
      p_workspace_id: 'workspace-1',
      p_brand_id: 'brand-old',
      p_replacement_brand_id: 'brand-new',
    });
    expect(reload).toHaveBeenCalledOnce();
  });

  it('kann verwendete Marken ausdrücklich ohne Ersatz löschen', async () => {
    const rpc = vi.fn(async () => ({ data: { deleted: true, reassigned: 2 }, error: null }));
    const service = Object.create(BrandService.prototype) as BrandService;
    Object.assign(service, {
      workspace: { currentWorkspace: signal({ id: 'workspace-1' }) },
      supabase: { client: { rpc } },
      reload: vi.fn(async () => undefined),
    });

    await service.replaceAndDelete('brand-old', null);

    expect(rpc).toHaveBeenCalledWith('replace_and_delete_brand', {
      p_workspace_id: 'workspace-1',
      p_brand_id: 'brand-old',
    });
  });
});
