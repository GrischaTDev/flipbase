import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { Json } from '../../../core/models/supabase.types';
import {
  readSaleDraftSnapshot,
  type SaleDraft,
  type SaleDraftSnapshot,
} from '../models/sale-draft.models';

interface SaleDraftRow {
  id: string;
  workspace_id: string;
  title: string;
  sale_amount: number;
  updated_at: string;
  draft: Json;
  vinted_source: {
    sale_state: string;
    title: string;
    amount: number | null;
    currency: string | null;
    is_bundle: boolean;
  } | null;
}

const SALE_DRAFT_COLUMNS =
  'id,workspace_id,title,sale_amount,updated_at,draft,vinted_source:vinted_sale_draft_sources!sale_drafts_vinted_source_fk(sale_state,title,amount,currency,is_bundle)';

/** Verkaufsentwürfe je Workspace; erst „Verkauf abschließen“ bucht den Verkauf. */
@Injectable({ providedIn: 'root' })
export class SaleDraftService {
  private readonly supabase = inject(SupabaseService);
  readonly drafts = signal<readonly SaleDraft[]>([]);
  readonly loadedWorkspaceId = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  private loadRequestId = 0;

  async load(workspaceId: string): Promise<void> {
    const requestId = ++this.loadRequestId;
    this.loadError.set(null);
    const { data, error } = await this.supabase.client
      .from('sale_drafts')
      .select(SALE_DRAFT_COLUMNS)
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });
    if (requestId !== this.loadRequestId) return;
    if (error) {
      this.loadError.set('Verkaufsentwürfe konnten nicht geladen werden.');
      return;
    }
    this.drafts.set((data ?? []).flatMap((row) => toSaleDraft(row) ?? []));
    this.loadedWorkspaceId.set(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<SaleDraft | null> {
    const { data, error } = await this.supabase.client
      .from('sale_drafts')
      .select(SALE_DRAFT_COLUMNS)
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error('Der Verkaufsentwurf konnte nicht geladen werden.');
    const draft = data ? toSaleDraft(data) : null;
    const source = draft?.vintedSource;
    if (!draft || !source || source.isBundle || !draft.snapshot.externalOrderId) return draft;

    const listingLink = await this.findVintedListingLink(
      draft.workspaceId,
      draft.snapshot.externalOrderId,
      source.title,
    );
    return listingLink ? { ...draft, vintedSource: { ...source, listingLink } } : draft;
  }

  private async findVintedListingLink(
    workspaceId: string,
    transactionId: string,
    sourceTitle: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabase.client
      .from('marketplace_account_entries')
      .select('connection_id,body,marketplace_connections!inner(marketplace)')
      .eq('workspace_id', workspaceId)
      .eq('marketplace_connections.marketplace', 'vinted')
      .eq('kind', 'sale')
      .eq('external_id', transactionId)
      .maybeSingle();

    const sale = data?.body;
    if (error || !data || !sale || typeof sale !== 'object' || Array.isArray(sale)) return null;
    const title = sale['title'];
    const itemIds = sale['itemIds'];
    if (
      typeof title !== 'string' ||
      title.trim().slice(0, 500) !== sourceTitle ||
      sale['isBundle'] === true ||
      sale['itemCount'] !== 1 ||
      !Array.isArray(itemIds) ||
      itemIds.length !== 1
    )
      return null;

    const [itemId] = itemIds;
    if (typeof itemId !== 'string' || !/^[1-9][0-9]{0,31}$/.test(itemId)) return null;

    const { data: listing, error: listingError } = await this.supabase.client
      .from('marketplace_account_entries')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('connection_id', data.connection_id)
      .eq('kind', 'publication')
      .eq('external_id', itemId)
      .maybeSingle();

    return !listingError && listing
      ? '/marketplaces/vinted/listings/' + data.connection_id + '/' + listing.id
      : null;
  }

  async save(input: {
    id: string | null;
    workspaceId: string;
    title: string;
    saleAmount: number;
    snapshot: SaleDraftSnapshot;
  }): Promise<string> {
    const values = {
      workspace_id: input.workspaceId,
      title: input.title.slice(0, 500),
      sale_amount: Math.max(0, Math.round(input.saleAmount * 100) / 100),
      draft: input.snapshot as unknown as Json,
    };
    const query = input.id
      ? this.supabase.client
          .from('sale_drafts')
          .update(values)
          .eq('workspace_id', input.workspaceId)
          .eq('id', input.id)
      : this.supabase.client.from('sale_drafts').insert(values);
    const { data, error } = await query.select('id').single();
    if (error || !data) throw new Error('Der Verkaufsentwurf konnte nicht gespeichert werden.');
    return data.id;
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('sale_drafts')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', id);
    if (error) throw new Error('Der Verkaufsentwurf konnte nicht gelöscht werden.');
    this.drafts.update((drafts) => drafts.filter((draft) => draft.id !== id));
  }
}

function toSaleDraft(row: SaleDraftRow): SaleDraft | null {
  const snapshot = readSaleDraftSnapshot(row.draft);
  const source = row.vinted_source;
  return snapshot
    ? {
        id: row.id,
        workspaceId: row.workspace_id,
        title: row.title,
        saleAmount: Number(row.sale_amount),
        updatedAt: row.updated_at,
        snapshot,
        vintedSource: source
          ? {
              saleState: source.sale_state,
              title: source.title,
              amount: source.amount,
              currency: source.currency,
              isBundle: source.is_bundle,
            }
          : undefined,
      }
    : null;
}
