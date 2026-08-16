import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { Supplier } from '../models/reflip.models';

@Injectable({
  providedIn: 'root',
})
export class SuppliersService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);

  readonly suppliers = signal<Supplier[]>([]);
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
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('suppliers')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true });

      if (!error && data) {
        this.suppliers.set(data as Supplier[]);
      }
    } catch (err) {
      console.error('Error loading suppliers:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async createSupplier(
    name: string,
    contactInfo?: string,
    notes?: string
  ): Promise<{ data: Supplier | null; error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    if (!ws) return { data: null, error: new Error('Kein aktiver Workspace ausgewählt') };

    try {
      const { data, error } = await this.supabase.client
        .from('suppliers')
        .insert({
          workspace_id: ws.id,
          name: name.trim(),
          contact_info: contactInfo?.trim() || null,
          notes: notes?.trim() || null,
        })
        .select()
        .single();

      if (error) return { data: null, error };

      const newSupplier = data as Supplier;
      this.suppliers.update((list) => [...list, newSupplier]);
      return { data: newSupplier, error: null };
    } catch (err: unknown) {
      return { data: null, error: err as Error };
    }
  }

  async deleteSupplier(supplierId: string): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.client
        .from('suppliers')
        .delete()
        .eq('id', supplierId);

      if (error) return { error };

      this.suppliers.update((list) => list.filter((s) => s.id !== supplierId));
      return { error: null };
    } catch (err: unknown) {
      return { error: err as Error };
    }
  }
}
