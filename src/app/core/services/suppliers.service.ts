import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { MockDataStoreService } from './mock-data-store.service';
import { Supplier } from '../models/reflip.models';

@Injectable({
  providedIn: 'root',
})
export class SuppliersService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly mockStore = inject(MockDataStoreService);

  readonly suppliers = signal<Supplier[]>(this.mockStore.demoSuppliers);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    effect(() => {
      const currentWs = this.workspaceService.currentWorkspace();
      if (currentWs) {
        this.loadSuppliers(currentWs.id);
      } else {
        this.suppliers.set([]);
      }
    });
  }

  async loadSuppliers(workspaceId: string): Promise<void> {
    const local = this.mockStore.getSuppliers(workspaceId);
    this.suppliers.set(local);

    if (this.mockStore.isDemoMode() || workspaceId.startsWith('demo-')) {
      return;
    }

    this.isLoading.set(true);
    try {
      const queryPromise = this.supabase.client
        .from('suppliers')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true });

      const res: any = await this.mockStore.withTimeout(queryPromise, { data: null, error: new Error('Timeout') }, 1000);

      if (res && !res.error && res.data && res.data.length > 0) {
        this.suppliers.set(res.data as Supplier[]);
        (res.data as Supplier[]).forEach((s) => this.mockStore.saveSupplier(s));
      }
    } catch (err) {
      // Keep local
    } finally {
      this.isLoading.set(false);
    }
  }

  async createSupplier(name: string, contactInfo?: string, notes?: string): Promise<{ data: Supplier | null; error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return { data: null, error: new Error('Kein aktiver Workspace ausgewählt') };

    const newSup: Supplier = {
      id: `sup-${Date.now()}`,
      workspace_id: ws.id,
      name: name.trim(),
      contact_info: contactInfo?.trim() || null,
      notes: notes?.trim() || null,
    };

    this.mockStore.saveSupplier(newSup);
    this.suppliers.update((list) => [...list, newSup]);

    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client.from('suppliers').insert({
          workspace_id: ws.id,
          name: name.trim(),
          contact_info: contactInfo?.trim() || null,
          notes: notes?.trim() || null,
        });
      } catch (e) {
        // ignore
      }
    }

    return { data: newSup, error: null };
  }

  async deleteSupplier(supplierId: string): Promise<{ error: Error | null }> {
    this.suppliers.update((list) => list.filter((s) => s.id !== supplierId));
    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client.from('suppliers').delete().eq('id', supplierId);
      } catch (e) {
        // ignore
      }
    }
    return { error: null };
  }
}
