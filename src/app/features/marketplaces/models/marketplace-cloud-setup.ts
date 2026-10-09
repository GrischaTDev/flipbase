import type {
  CloudSetupState,
  CloudSetupView,
  CloudSetupResult,
} from '../../../../../supabase/functions/_shared/marketplace-cloud-setup-contracts';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states: readonly CloudSetupState[] = [
  'reserved',
  'login',
  'verified',
  'finalizing',
  'completed',
  'cleanup_pending',
  'cancelled',
];

export function parseCloudSetupView(
  response: unknown,
  expected: { workspaceId: string; connectionId?: string; setupId?: string },
): CloudSetupView {
  if (!response || typeof response !== 'object' || Array.isArray(response))
    throw new Error('Ungültige Cloud-Einrichtungsantwort');
  const fields = response as Record<string, unknown>;
  const names = ['workspaceId', 'connectionId', 'setupId', 'state', 'sessionId'];
  if (
    Object.keys(fields).length !== names.length ||
    names.some((name) => !Object.hasOwn(fields, name)) ||
    ['workspaceId', 'connectionId', 'setupId'].some(
      (name) => typeof fields[name] !== 'string' || !uuidPattern.test(fields[name]),
    ) ||
    fields['workspaceId'] !== expected.workspaceId ||
    (expected.connectionId !== undefined && fields['connectionId'] !== expected.connectionId) ||
    (expected.setupId !== undefined && fields['setupId'] !== expected.setupId) ||
    !states.includes(fields['state'] as CloudSetupState) ||
    (fields['sessionId'] !== null &&
      (typeof fields['sessionId'] !== 'string' || !uuidPattern.test(fields['sessionId'])))
  )
    throw new Error('Ungültige Cloud-Einrichtungsantwort');
  return fields as unknown as CloudSetupView;
}

export function parseCloudSetupResult(
  response: unknown,
  expected: { workspaceId: string; connectionId?: string },
): CloudSetupResult {
  if (!response || typeof response !== 'object' || Array.isArray(response))
    throw new Error('Ungültige Cloud-Einrichtungsantwort');
  const fields = response as Record<string, unknown>;
  if (
    [
      'no_capacity',
      'purchase_pending',
      'purchase_failed',
      'limit_reached',
      'price_limit_exceeded',
    ].includes(String(fields['status'])) &&
    Object.keys(fields).length === 1
  )
    return fields as unknown as CloudSetupResult;
  if (
    fields['status'] === 'ready' &&
    Object.keys(fields).length === 2 &&
    Object.hasOwn(fields, 'setup')
  )
    return { status: 'ready', setup: parseCloudSetupView(fields['setup'], expected) };
  throw new Error('Ungültige Cloud-Einrichtungsantwort');
}

export type {
  CloudSetupRequest,
  CloudSetupView,
  CloudSetupResult,
} from '../../../../../supabase/functions/_shared/marketplace-cloud-setup-contracts';
