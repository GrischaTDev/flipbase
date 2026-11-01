import {
  kleinanzeigenRecord,
  parseKleinanzeigenExtensionRequest,
  parseKleinanzeigenExtensionSession,
  parseKleinanzeigenSyncRun,
  type KleinanzeigenExtensionRequest,
} from './kleinanzeigen-contracts.ts';

export interface KleinanzeigenMaintenanceRequest extends Omit<
  KleinanzeigenExtensionRequest,
  'action'
> {
  readonly action: 'maintain';
  readonly externalAccountId: string;
}

export function parseKleinanzeigenMaintenanceRequest(
  value: unknown,
): KleinanzeigenMaintenanceRequest | null {
  if (
    !kleinanzeigenRecord(value) ||
    Object.keys(value).sort().join(',') !==
      'action,connectionId,externalAccountId,generation,workspaceId' ||
    value.action !== 'maintain' ||
    typeof value.externalAccountId !== 'string' ||
    !/^[1-9][0-9]{0,31}$/u.test(value.externalAccountId)
  )
    return null;
  const scope = parseKleinanzeigenExtensionRequest({
    action: 'heartbeat',
    workspaceId: value.workspaceId,
    connectionId: value.connectionId,
    generation: value.generation,
  });
  return scope
    ? { ...scope, action: 'maintain', externalAccountId: value.externalAccountId }
    : null;
}

export function parseKleinanzeigenMaintenanceReply(
  value: unknown,
  input: KleinanzeigenMaintenanceRequest,
) {
  if (!kleinanzeigenRecord(value) || Object.keys(value).sort().join(',') !== 'run,session')
    return null;
  const session = parseKleinanzeigenExtensionSession(value.session, {
    ...input,
    action: 'heartbeat',
  });
  if (!session || session.externalAccountId !== input.externalAccountId) return null;
  const run = value.run === null ? null : parseKleinanzeigenSyncRun(value.run, input);
  if (value.run !== null && (!run || run.generation !== input.generation)) return null;
  return { session, run };
}
