import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { readSizeReferences, type SizeReferenceContent } from '../models/size-reference';
import { LabelRpcError } from '../models/brand-label-rpc';
import type { Database } from '../../../core/models/supabase.types';

export interface SizeReferenceCommand {
  readonly kind: 'save' | 'archive';
  readonly id: number | null;
  readonly expectedVersion: number | null;
  readonly requestId: string;
  readonly brandId: number | null;
  readonly content: SizeReferenceContent | null;
  readonly publish: boolean;
  readonly archived: boolean;
}
@Injectable({ providedIn: 'root' })
export class SizeReferenceService {
  private readonly client = inject(SupabaseService).client;
  async list(admin: boolean) {
    const { data, error } = await this.client.rpc('list_size_references', { p_admin: admin });
    if (error?.code === '42501') throw new LabelRpcError('forbidden');
    if (error) throw new Error('Die Größenreferenzen konnten nicht geladen werden.');
    return readSizeReferences(data);
  }
  async execute(command: SizeReferenceCommand): Promise<void> {
    const result =
      command.kind === 'save'
        ? // Die generierten RPC-Typen bilden erlaubte SQL-null-Argumente nicht ab.
          await this.client.rpc('save_size_reference', {
            p_id: command.id,
            p_expected_version: command.expectedVersion,
            p_brand_id: command.brandId,
            p_content: JSON.parse(JSON.stringify(command.content)),
            p_publish: command.publish,
            p_request_id: command.requestId,
          } as Database['public']['Functions']['save_size_reference']['Args'])
        : await this.client.rpc('archive_size_reference', {
            p_id: command.id ?? 0,
            p_expected_version: command.expectedVersion ?? 0,
            p_archived: command.archived,
            p_request_id: command.requestId,
          });
    const receipt = result.data;
    if (result.error?.code === '42501') throw new LabelRpcError('forbidden');
    if (result.error?.code === '22023') throw new LabelRpcError('validation');
    if (result.error?.code === 'P0001') throw new LabelRpcError('conflict');
    if (result.error)
      throw new Error(
        result.error.code === 'P0001'
          ? 'Der Eintrag wurde inzwischen geändert. Deine Eingaben bleiben erhalten. Bitte lade neu.'
          : result.error.code === '42501'
            ? 'Du darfst die Größenreferenzen nicht bearbeiten.'
            : 'Die Änderung ist nicht bestätigt. Wiederhole den ursprünglichen Auftrag.',
      );
    if (
      !receipt ||
      typeof receipt !== 'object' ||
      Array.isArray(receipt) ||
      receipt['version'] !== (command.expectedVersion ?? 0) + 1 ||
      (command.kind === 'save' &&
        (typeof receipt['id'] !== 'number' ||
          (command.id !== null && receipt['id'] !== command.id)))
    ) {
      throw new Error('Die Änderung ist nicht bestätigt. Wiederhole den ursprünglichen Auftrag.');
    }
  }
}
