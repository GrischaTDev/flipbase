import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Tables } from '../../../core/models/supabase.types';

type StoreOrderSummary = Pick<
  Tables<'store_orders'>,
  'id' | 'order_number' | 'created_at' | 'total' | 'payment_status' | 'status'
>;
@Injectable()
export class StoreOrderListService {
  private readonly supabase = inject(SupabaseService);
  readonly orders = signal<StoreOrderSummary[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal('');
  private generation = 0;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.generation++);
  }
  async loadOrders(workspaceId: string): Promise<void> {
    const generation = ++this.generation;
    this.orders.set([]);
    this.error.set('');
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('store_orders')
        .select('id,order_number,created_at,total,payment_status,status')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      if (generation === this.generation) this.orders.set(data ?? []);
    } catch {
      if (generation === this.generation)
        this.error.set(
          'Die Shop-Bestellungen konnten nicht geladen werden. Bitte versuche es erneut.',
        );
    } finally {
      if (generation === this.generation) this.isLoading.set(false);
    }
  }
}
