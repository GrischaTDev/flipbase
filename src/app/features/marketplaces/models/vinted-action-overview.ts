import type { AccountScope } from './marketplace.models';
import { MarketplaceResponseError } from './marketplace-response';

export type VintedActionKind = 'accept' | 'decline' | 'counter' | 'message' | 'sync';
export type VintedActionState =
  'queued' | 'running' | 'succeeded' | 'failed' | 'outcome_unknown' | 'cancelled' | 'skipped';
export interface VintedAction {
  readonly id: string;
  readonly source: 'negotiation' | 'message' | 'sync';
  readonly sourceId: string;
  readonly isAutomated: boolean;
  readonly kind: VintedActionKind;
  readonly state: VintedActionState;
  readonly conversationId: string | null;
  readonly messageId: string | null;
  readonly offerId: string | null;
  readonly partnerName: string | null;
  readonly itemTitle: string | null;
  readonly priceCents: number | null;
  readonly currency: string | null;
  readonly textPreview: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly errorCode: string | null;
}
export interface VintedActionOverview extends AccountScope {
  readonly actions: readonly VintedAction[];
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(candidate: unknown): Record<string, unknown> {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
    throw new MarketplaceResponseError();
  return candidate as Record<string, unknown>;
}
function nullableString(candidate: unknown): string | null {
  if (candidate === null || typeof candidate === 'string') return candidate;
  throw new MarketplaceResponseError();
}
function nullableId(candidate: unknown): string | null {
  const identifier = nullableString(candidate);
  if (identifier !== null && !uuid.test(identifier)) throw new MarketplaceResponseError();
  return identifier;
}
function timestamp(candidate: unknown): string {
  if (typeof candidate !== 'string' || !Number.isFinite(Date.parse(candidate)))
    throw new MarketplaceResponseError();
  return candidate;
}
export function parseVintedActionOverview(
  candidate: unknown,
  scope: AccountScope,
): VintedActionOverview {
  const overview = record(candidate);
  if (
    overview['ok'] !== true ||
    overview['workspaceId'] !== scope.workspaceId ||
    overview['connectionId'] !== scope.connectionId ||
    !Array.isArray(overview['actions'])
  )
    throw new MarketplaceResponseError();
  const identifiers = new Set<string>();
  const actions = overview['actions'].map((candidate): VintedAction => {
    const action = record(candidate);
    const source = action['source'];
    const sourceId = nullableId(action['sourceId']);
    const isAutomated = action['isAutomated'];
    const kind = action['kind'];
    const state = action['state'];
    const priceCents = action['priceCents'];
    const currency = nullableString(action['currency']);
    if (
      (source !== 'negotiation' && source !== 'message' && source !== 'sync') ||
      typeof isAutomated !== 'boolean' ||
      !sourceId ||
      (kind !== 'accept' &&
        kind !== 'decline' &&
        kind !== 'counter' &&
        kind !== 'message' &&
        kind !== 'sync') ||
      (source === 'message' && kind !== 'message') ||
      (source === 'sync' && kind !== 'sync') ||
      (source === 'negotiation' && kind === 'sync') ||
      (state !== 'queued' &&
        state !== 'running' &&
        state !== 'succeeded' &&
        state !== 'failed' &&
        state !== 'outcome_unknown' &&
        state !== 'cancelled' &&
        state !== 'skipped') ||
      action['id'] !== `${source}:${sourceId}` ||
      identifiers.has(action['id'] as string) ||
      (priceCents !== null &&
        (typeof priceCents !== 'number' || !Number.isSafeInteger(priceCents) || priceCents < 0)) ||
      (currency !== null && !/^[A-Z]{3}$/.test(currency))
    )
      throw new MarketplaceResponseError();
    const id = `${source}:${sourceId}`;
    identifiers.add(id);
    return {
      id,
      source,
      sourceId,
      isAutomated,
      kind,
      state,
      priceCents: priceCents as number | null,
      currency,
      conversationId: nullableId(action['conversationId']),
      messageId: nullableId(action['messageId']),
      offerId: nullableString(action['offerId']),
      partnerName: nullableString(action['partnerName']),
      itemTitle: nullableString(action['itemTitle']),
      textPreview: nullableString(action['textPreview']),
      createdAt: timestamp(action['createdAt']),
      updatedAt: timestamp(action['updatedAt']),
      errorCode: nullableString(action['errorCode']),
    };
  });
  return { ...scope, actions };
}
export function groupVintedActions(actions: readonly VintedAction[]) {
  const oldestFirst = (first: VintedAction, second: VintedAction) =>
    Date.parse(first.createdAt) - Date.parse(second.createdAt) || first.id.localeCompare(second.id);
  const newestFirst = (first: VintedAction, second: VintedAction) =>
    Date.parse(second.updatedAt) - Date.parse(first.updatedAt) || first.id.localeCompare(second.id);
  return {
    running: actions.filter((action) => action.state === 'running').sort(oldestFirst),
    queued: actions.filter((action) => action.state === 'queued').sort(oldestFirst),
    attention: actions
      .filter((action) => action.state === 'failed' || action.state === 'outcome_unknown')
      .sort(newestFirst),
    recent: actions
      .filter((action) => ['succeeded', 'cancelled', 'skipped'].includes(action.state))
      .sort(newestFirst),
  };
}
export function describeVintedAction(action: VintedAction): string {
  const labels: Record<VintedActionKind, readonly [string, string, string]> = {
    accept: ['Angebot annehmen', 'Angebot wird angenommen', 'Angebot angenommen'],
    decline: ['Angebot ablehnen', 'Angebot wird abgelehnt', 'Angebot abgelehnt'],
    counter: ['Gegenangebot senden', 'Gegenangebot wird gesendet', 'Gegenangebot gesendet'],
    message: ['Nachricht senden', 'Nachricht wird gesendet', 'Nachricht gesendet'],
    sync: ['Kontodaten aktualisieren', 'Kontodaten werden aktualisiert', 'Kontodaten aktualisiert'],
  };
  return labels[action.kind][action.state === 'succeeded' ? 2 : action.state === 'running' ? 1 : 0];
}
