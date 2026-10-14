export type WebPushCategory = 'message' | 'order' | 'favorite' | 'connection';
export type WebPushDeviceStatus =
  | 'unsupported'
  | 'home_app_required'
  | 'permission_required'
  | 'denied'
  | 'checking'
  | 'disabled'
  | 'ready'
  | 'registering'
  | 'pending'
  | 'active'
  | 'revoke_pending'
  | 'error';

export type PushTarget =
  | { kind: 'settings' }
  | { kind: 'vinted_message'; connectionId: string; conversationId: string }
  | { kind: 'vinted_favorites'; connectionId: string }
  | { kind: 'ebay_orders'; connectionId: string }
  | { kind: 'store_orders' }
  | { kind: 'connection'; connectionId: string };

export interface PushPayloadV1 {
  version: 1;
  eventId: string;
  workspaceId: string;
  category: WebPushCategory | 'test';
  title: string;
  body: string;
  target: PushTarget;
}
export interface WebPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}
export interface WebPushRegistration {
  generationId: string;
  installationId: string;
  tokenHash: string;
  keyId: string;
  subscription: WebPushSubscription;
}
export interface WebPushServerSettings {
  enabled: boolean;
  publicKey: string;
  keyId: string;
  binding: { deviceId: string; active: boolean; keyId: string } | null;
  allowedCategories: WebPushCategory[];
  preferences: { workspaceId: string; categories: WebPushCategory[] }[];
}
export interface WebPushLocalBinding extends WebPushRegistration {
  userId: string;
  sessionId: string;
  token: string;
  state: 'prepared' | 'active' | 'revoke_pending';
}

const identifier = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isPushIdentifier(candidate: unknown): candidate is string {
  return typeof candidate === 'string' && identifier.test(candidate);
}
export function parsePushPayload(candidate: unknown): PushPayloadV1 | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const payload = candidate as Record<string, unknown>;
  if (
    Object.keys(payload).some(
      (key) =>
        !['version', 'eventId', 'workspaceId', 'category', 'title', 'body', 'target'].includes(key),
    )
  )
    return null;
  if (
    payload['version'] !== 1 ||
    !isPushIdentifier(payload['eventId']) ||
    !isPushIdentifier(payload['workspaceId'])
  )
    return null;
  if (
    typeof payload['title'] !== 'string' ||
    payload['title'].length > 80 ||
    typeof payload['body'] !== 'string' ||
    payload['body'].length > 160
  )
    return null;
  if (!payload['target'] || typeof payload['target'] !== 'object') return null;
  const target = payload['target'] as Record<string, unknown>;
  const category = payload['category'];
  const kind = target['kind'];
  const fields = Object.keys(target);
  if (kind === 'settings' && category === 'test' && fields.length === 1)
    return candidate as PushPayloadV1;
  if (kind === 'store_orders' && category === 'order' && fields.length === 1)
    return candidate as PushPayloadV1;
  if (!isPushIdentifier(target['connectionId'])) return null;
  if (
    kind === 'vinted_message' &&
    category === 'message' &&
    isPushIdentifier(target['conversationId']) &&
    fields.length === 3
  )
    return candidate as PushPayloadV1;
  if (
    ((kind === 'ebay_orders' && category === 'order') ||
      (kind === 'vinted_favorites' && category === 'favorite') ||
      (kind === 'connection' && category === 'connection')) &&
    fields.length === 2
  )
    return candidate as PushPayloadV1;
  return null;
}
