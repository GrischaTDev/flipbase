import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import type { Json } from '../../../core/models/supabase.types';
import {
  readReaderReceipt,
  type LabelReaderCommand,
  readAdminDraft,
  readAdminPage,
  readAdminReference,
  type LabelAdminCommand,
  type LabelAdminFilter,
} from '../models/brand-label-admin';
import {
  executeLabelRevisionCommand,
  LabelRpcError,
  type LabelRevisionCommand,
} from '../models/brand-label-rpc';
import { readLabelId, readLabelObject } from '../models/brand-label-validation';
function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value));
}
export function adminError(error: unknown): LabelRpcError {
  if (error instanceof LabelRpcError) return error;
  const row = error !== null && typeof error === 'object' ? error : null;
  const code = row && 'code' in row ? row.code : null;
  const details = row && 'details' in row ? row.details : null;
  return new LabelRpcError(
    code === '42501'
      ? 'forbidden'
      : code === 'P0001' && details === 'label_version_conflict'
        ? 'conflict'
        : code === '22023'
          ? 'validation'
          : code === 'P0002' || code === 'PGRST202'
            ? 'unavailable'
            : 'network',
  );
}
async function confirmed<T>(
  request: PromiseLike<{ data: unknown; error: unknown }>,
  decode: (value: unknown) => T,
): Promise<T> {
  let response;
  try {
    response = await request;
  } catch (error) {
    throw adminError(error);
  }
  if (response.error) throw adminError(response.error);
  try {
    return decode(response.data);
  } catch {
    throw new LabelRpcError('network');
  }
}
@Injectable({ providedIn: 'root' })
export class BrandLabelAdminService {
  private readonly client = inject(SupabaseService).client;
  readerSettings() {
    return confirmed(
      this.client.from('label_library_settings').select('reader_enabled').eq('id', 1).single(),
      (value) => {
        const row = readLabelObject(value, ['reader_enabled'], 'settings');
        if (typeof row['reader_enabled'] !== 'boolean') throw new Error('Invalid settings');
        return row['reader_enabled'];
      },
    );
  }
  setReader(command: LabelReaderCommand) {
    return confirmed(
      this.client.rpc('set_label_library_enabled', {
        p_enabled: command.enabled,
        p_request_id: command.requestId,
      }),
      (value) => readReaderReceipt(value, command),
    );
  }
  list(filter: LabelAdminFilter, offset = 0) {
    return confirmed(
      this.client.rpc('list_label_admin_references', { p_filter: json(filter), p_offset: offset }),
      readAdminPage,
    );
  }
  detail(referenceId: number) {
    return confirmed(
      this.client.rpc('get_label_admin_reference', { p_reference_id: referenceId }),
      readAdminReference,
    );
  }
  execute(command: LabelAdminCommand) {
    if (command.action === 'create')
      return confirmed(
        this.client.rpc('create_label_draft', {
          p_brand_id: command.brandId,
          p_request_id: command.requestId,
        }),
        (value) => {
          const draft = readAdminDraft(value);
          if (!draft || draft.state !== 'draft' || draft.version !== 1)
            throw new Error('Invalid creation');
          return draft;
        },
      );
    if (command.action === 'edit')
      return confirmed(
        this.client.rpc('edit_label_reference', {
          p_reference_id: command.referenceId,
          p_request_id: command.requestId,
        }),
        (value) => {
          const draft = readAdminDraft(value);
          if (
            !draft ||
            draft.referenceId !== command.referenceId ||
            !['draft', 'review'].includes(draft.state)
          )
            throw new Error('Invalid edit');
          return draft;
        },
      );
    return confirmed(
      this.client.rpc(
        command.action === 'archive' ? 'archive_label_reference' : 'restore_label_reference',
        {
          p_reference_id: command.referenceId,
          p_expected_version: command.expectedVersion,
          p_request_id: command.requestId,
        },
      ),
      (value) => {
        const row = readLabelObject(value, ['referenceId', 'version', 'archived'], 'receipt');
        const referenceId = readLabelId(row['referenceId'], 'referenceId');
        const version = readLabelId(row['version'], 'version');
        const archived = row['archived'];
        if (
          referenceId !== command.referenceId ||
          version !== command.expectedVersion + 1 ||
          archived !== (command.action === 'archive')
        )
          throw new Error('Invalid receipt');
        return { referenceId, version, archived: command.action === 'archive' };
      },
    );
  }
  revision(command: LabelRevisionCommand) {
    return executeLabelRevisionCommand(command, (name) => {
      const args = {
        p_revision_id: command.revisionId,
        p_expected_version: command.expectedVersion,
        p_request_id: command.requestId,
      };
      switch (name) {
        case 'save_label_draft':
          return this.client.rpc(name, { ...args, p_input: json(command.input) });
        case 'submit_label_draft':
          return this.client.rpc(name, args);
        case 'publish_label_draft':
          return this.client.rpc(name, args);
        case 'discard_label_draft':
          return this.client.rpc(name, args);
      }
    });
  }
}
