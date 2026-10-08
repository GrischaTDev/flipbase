import type { LabelDraft, LabelDraftInput, LabelErrorCode } from './brand-label.models';
import { LABEL_LIMITS } from './brand-label-limits';
import { validateLabelDraftInput } from './brand-label-draft';
import { nextLabelRevisionState, type LabelRevisionAction } from './brand-label-revision';
import { readLabelId, readLabelObject } from './brand-label-validation';

/** Flüchtiger, unveränderlicher Auftrag; weder Rolle noch Speicherpfade werden übertragen. */
export interface LabelRevisionCommand {
  readonly action: LabelRevisionAction;
  readonly referenceId: number;
  readonly revisionId: number;
  readonly expectedVersion: number;
  readonly requestId: string;
  readonly input: LabelDraftInput | null;
}
export type LabelRpcName =
  'save_label_draft' | 'submit_label_draft' | 'publish_label_draft' | 'discard_label_draft';
export type LabelRpcTransport = (
  name: LabelRpcName,
  args: Readonly<Record<string, unknown>>,
) => PromiseLike<{ data: unknown; error: unknown }>;
export interface LabelPublicationReceipt {
  readonly referenceId: number;
  readonly revisionId: number;
  readonly version: number;
}
export interface LabelDiscardReceipt extends LabelPublicationReceipt {
  readonly state: 'discarded';
}
export type LabelRevisionResult = LabelDraft | LabelPublicationReceipt | LabelDiscardReceipt;

const RPC_NAMES: Readonly<Record<LabelRevisionAction, LabelRpcName>> = Object.freeze({
  save: 'save_label_draft',
  submit: 'submit_label_draft',
  publish: 'publish_label_draft',
  discard: 'discard_label_draft',
});
const MESSAGES: Readonly<Record<LabelErrorCode, string>> = Object.freeze({
  unauthorized: 'Bitte melde Dich erneut an.',
  forbidden: 'Du darfst diese Labeldaten nicht bearbeiten.',
  unavailable: 'Dieser Eintrag ist nicht verfügbar.',
  conflict: 'Der Eintrag wurde inzwischen geändert. Deine Eingaben bleiben erhalten.',
  validation: 'Bitte prüfe die Angaben. Der Auftrag wurde nicht bestätigt.',
  'upload-failed': 'Das Bild konnte nicht hochgeladen werden.',
  'processing-failed': 'Das Bild konnte nicht verarbeitet werden.',
  network:
    'Die Antwort konnte nicht bestätigt werden. Der Auftrag wurde nicht automatisch wiederholt.',
});

/** Keine SQL-Texte, Tokens oder fremden Pfade in nutzerseitige Fehler übernehmen. */
export class LabelRpcError extends Error {
  constructor(readonly code: LabelErrorCode) {
    super(MESSAGES[code]);
    this.name = 'LabelRpcError';
  }
}

function requestIdentifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new LabelRpcError('validation');
  }
  return value.toLowerCase();
}
function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

function validateCommand(value: LabelRevisionCommand): LabelRevisionCommand {
  const command = readLabelObject(
    value,
    ['action', 'referenceId', 'revisionId', 'expectedVersion', 'requestId', 'input'],
    'command',
  );
  const action = command['action'];
  if (action !== 'save' && action !== 'submit' && action !== 'publish' && action !== 'discard') {
    throw new LabelRpcError('validation');
  }
  const expectedVersion = readLabelId(command['expectedVersion'], 'command.expectedVersion');
  if (expectedVersion >= LABEL_LIMITS.maxId) throw new LabelRpcError('validation');
  if (action !== 'save' && command['input'] !== null) throw new LabelRpcError('validation');
  return freezeJson({
    action,
    referenceId: readLabelId(command['referenceId'], 'command.referenceId'),
    revisionId: readLabelId(command['revisionId'], 'command.revisionId'),
    expectedVersion,
    requestId: requestIdentifier(command['requestId']),
    input: action === 'save' ? validateLabelDraftInput(command['input']) : null,
  });
}

/** Vor dem ersten Senden anlegen und bei einem bewussten Retry unverändert wiederverwenden. */
export function prepareLabelRevisionCommand(
  action: LabelRevisionAction,
  draft: LabelDraft,
  requestId: string,
): LabelRevisionCommand {
  try {
    nextLabelRevisionState(draft.state, action);
    return validateCommand({
      action,
      referenceId: draft.referenceId,
      revisionId: draft.revisionId,
      expectedVersion: draft.version,
      requestId,
      input: action === 'save' ? draft.input : null,
    });
  } catch {
    throw new LabelRpcError('validation');
  }
}

function ownData(value: object, key: string): unknown {
  const property = Object.getOwnPropertyDescriptor(value, key);
  if (!property || !('value' in property) || !property.enumerable)
    throw new LabelRpcError('network');
  return property.value;
}

function mapRpcError(value: unknown): LabelRpcError {
  if (!value || typeof value !== 'object') return new LabelRpcError('network');
  let error: { code?: unknown; details?: unknown; status?: unknown };
  try {
    const field = (key: string): unknown =>
      Object.hasOwn(value, key) ? ownData(value, key) : undefined;
    error = { code: field('code'), details: field('details'), status: field('status') };
  } catch {
    return new LabelRpcError('network');
  }
  if (error.status === 401) return new LabelRpcError('unauthorized');
  if (error.code === '42501' || error.status === 403) return new LabelRpcError('forbidden');
  if (error.code === '22023') return new LabelRpcError('validation');
  if (error.code === 'P0001' && error.details === 'label_version_conflict') {
    return new LabelRpcError('conflict');
  }
  if (error.code === 'P0002') return new LabelRpcError('unavailable');
  return new LabelRpcError('network');
}

function resultFor(value: unknown, command: LabelRevisionCommand): LabelRevisionResult {
  const keys =
    command.action === 'publish'
      ? ['referenceId', 'revisionId', 'version']
      : command.action === 'discard'
        ? ['referenceId', 'revisionId', 'version', 'state']
        : ['referenceId', 'revisionId', 'version', 'state', 'input'];
  const row = readLabelObject(value, keys, 'result');
  const referenceId = readLabelId(row['referenceId'], 'result.referenceId');
  const revisionId = readLabelId(row['revisionId'], 'result.revisionId');
  const version = readLabelId(row['version'], 'result.version');
  if (
    referenceId !== command.referenceId ||
    revisionId !== command.revisionId ||
    version !== command.expectedVersion + 1
  ) {
    throw new LabelRpcError('network');
  }
  const receipt = { referenceId, revisionId, version };
  if (command.action === 'publish') return receipt;
  if (command.action === 'discard') {
    if (row['state'] !== 'discarded') throw new LabelRpcError('network');
    return { ...receipt, state: 'discarded' };
  }
  const state = command.action === 'save' ? 'draft' : 'review';
  if (row['state'] !== state) throw new LabelRpcError('network');
  const input = validateLabelDraftInput(row['input']);
  if (command.action === 'save' && JSON.stringify(input) !== JSON.stringify(command.input)) {
    throw new LabelRpcError('network');
  }
  return { ...receipt, state, input };
}

/**
 * Nutzt später den bestehenden Supabase-Client über einen kleinen Adapter.
 * Keine eigene Anmeldung, kein Service-Key, kein automatischer Retry.
 * Eine Antwort gilt erst nach Identitäts-/Versions-/Formprüfung als bestätigt.
 * Serverberechtigungen werden dadurch weder ersetzt noch nachgewiesen.
 */
export async function executeLabelRevisionCommand(
  value: LabelRevisionCommand,
  transport: LabelRpcTransport,
): Promise<LabelRevisionResult> {
  let command: LabelRevisionCommand;
  try {
    command = validateCommand(value);
  } catch {
    throw new LabelRpcError('validation');
  }
  const args: Readonly<Record<string, unknown>> = freezeJson({
    p_revision_id: command.revisionId,
    p_expected_version: command.expectedVersion,
    ...(command.action === 'save' ? { p_input: command.input } : {}),
    p_request_id: command.requestId,
  });
  let response: { data: unknown; error: unknown };
  try {
    response = await transport(RPC_NAMES[command.action], args);
  } catch (error: unknown) {
    throw mapRpcError(error);
  }
  if (!response || typeof response !== 'object') throw new LabelRpcError('network');
  let data: unknown;
  let error: unknown;
  try {
    data = ownData(response, 'data');
    error = ownData(response, 'error');
  } catch {
    throw new LabelRpcError('network');
  }
  if (error !== null) throw mapRpcError(error);
  try {
    return resultFor(data, command);
  } catch {
    throw new LabelRpcError('network');
  }
}
