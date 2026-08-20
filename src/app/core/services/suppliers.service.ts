import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SyncStatusService } from './sync-status.service';
import { Supplier } from '../models/reflip.models';

@Injectable({
  providedIn: 'root',
})
export class SuppliersService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly mockStore = inject(MockDataStoreService);

  readonly suppliers = signal<Supplier[]>([]);
  readonly isLoading = signal<boolean>(false);

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung in Phase 8 auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const currentWs = this.workspaceService.currentWorkspace();
        if (currentWs) {
          this.loadSuppliers(currentWs.id);
        } else {
          this.suppliers.set([]);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
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
        this.syncStatus.melde('Laden der Lieferanten', error);
        this.suppliers.set([]);
      } else if (data) {
        this.suppliers.set(data as Supplier[]);
      }
    } catch (err) {
      this.syncStatus.melde('Laden der Lieferanten', err);
      this.suppliers.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createSupplier(
    name: string,
    contactInfo?: string,
    notes?: string,
  ): Promise<{ data: Supplier | null; error: Error | null }> {
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

    if (!this.mockStore.isDemoMode() && !this.mockStore?.isDemoMode()) {
      try {
        const { data: dbSup, error: dbError } = await this.supabase.client
          .from('suppliers')
          .insert({
            workspace_id: ws.id,
            name: name.trim(),
            contact_info: contactInfo?.trim() || null,
            notes: notes?.trim() || null,
          })
          .select()
          .single();

        if (dbError) {
          return { data: null, error: this.syncStatus.melde('Anlegen des Lieferanten', dbError) };
        } else if (dbSup) {
          const finalSup: Supplier = { ...newSup, id: dbSup.id };
          // Vorlaeufigen Eintrag entfernen, sonst bleibt er mit seiner
          // Behelfs-Kennung im lokalen Spiegel liegen (Duplikat).
          this.mockStore.deleteSupplier(newSup.id);
          this.mockStore.saveSupplier(finalSup);
          this.suppliers.update((list) => [finalSup, ...list.filter((s) => s.id !== newSup.id)]);
          return { data: finalSup, error: null };
        }
      } catch (e) {
        return { data: null, error: this.syncStatus.melde('Anlegen des Lieferanten', e) };
      }
    }

    return { data: newSup, error: null };
  }

  async deleteSupplier(supplierId: string): Promise<{ error: Error | null }> {
    this.suppliers.update((list) => list.filter((s) => s.id !== supplierId));
    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client
          .from('suppliers')
          .delete()
          .eq('id', supplierId);
        if (error) {
          return { error: this.syncStatus.melde('Löschen des Lieferanten', error) };
        }
      } catch (e: unknown) {
        return { error: this.syncStatus.melde('Löschen des Lieferanten', e) };
      }
    }
    return { error: null };
  }
}
