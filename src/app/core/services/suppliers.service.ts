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

  readonly suppliers = signal<Supplier[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    try {
      effect(() => {
        const currentWs = this.workspaceService.currentWorkspace();
        if (currentWs) {
          this.loadSuppliers(currentWs.id);
        } else {
          this.suppliers.set([]);
        }
      });
    } catch {}
  }

  async loadSuppliers(workspaceId: string): Promise<void> {
    if (this.mockStore.isDemoMode()) {
      const local = this.mockStore.getSuppliers(workspaceId);
      this.suppliers.set(local);
      return;
    }

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('suppliers')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true });

      if (error) {
        console.error('Fehler beim Laden der Lieferanten aus Supabase:', error);
        this.suppliers.set([]);
      } else if (data) {
        this.suppliers.set(data as Supplier[]);
      }
    } catch (err) {
      console.error('Verbindungsfehler beim Laden der Lieferanten:', err);
      this.suppliers.set([]);
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

    if (!this.mockStore.isDemoMode() && !ws.id.startsWith('demo-')) {
      try {
        const { data: dbSup, error: dbError } = await this.supabase.client.from('suppliers').insert({
          workspace_id: ws.id,
          name: name.trim(),
          contact_info: contactInfo?.trim() || null,
          notes: notes?.trim() || null,
        }).select().single();

        if (dbError) {
          console.error('Fehler beim Anlegen des Lieferanten in Supabase:', dbError);
        } else if (dbSup) {
          const finalSup: Supplier = { ...newSup, id: dbSup.id };
          this.mockStore.saveSupplier(finalSup);
          this.suppliers.update((list) => [finalSup, ...list.filter((s) => s.id !== newSup.id)]);
          return { data: finalSup, error: null };
        }
      } catch (e) {
        console.error('Verbindungsfehler beim Anlegen des Lieferanten:', e);
      }
    }

    return { data: newSup, error: null };
  }

  async deleteSupplier(supplierId: string): Promise<{ error: Error | null }> {
    this.suppliers.update((list) => list.filter((s) => s.id !== supplierId));
    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client.from('suppliers').delete().eq('id', supplierId);
        if (error) {
          console.error('Fehler beim Löschen des Lieferanten in Supabase:', error);
          return { error: new Error(error.message) };
        }
      } catch (e: any) {
        console.error('Verbindungsfehler beim Löschen des Lieferanten:', e);
      }
    }
    return { error: null };
  }
}
