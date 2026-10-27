import { describe, expect, it } from 'vitest';
import {
  parseVintedActionOverview,
  groupVintedActions,
  describeVintedAction,
} from './vinted-action-overview';

const scope = { workspaceId: 'workspace-a', connectionId: 'account-a' };
const sourceId = '25000000-0000-4000-8000-000000000051';
const action = {
  id: `negotiation:${sourceId}`,
  source: 'negotiation',
  sourceId,
  kind: 'accept',
  state: 'queued',
  conversationId: '25000000-0000-4000-8000-000000000052',
  messageId: '25000000-0000-4000-8000-000000000053',
  partnerName: 'Anna',
  itemTitle: 'Jacke',
  priceCents: 6000,
  currency: 'EUR',
  textPreview: null,
  offerId: '123',
  isAutomated: false,
  createdAt: '2026-10-27T10:00:00Z',
  updatedAt: '2026-10-27T10:00:00Z',
  errorCode: null,
};
function response(actions: readonly unknown[] = [action]) {
  return { ok: true, ...scope, actions };
}
describe('Vinted-Aktionsübersicht', () => {
  it('erhält bestätigte Auftragskennung, Chatzuordnung und unbekannte Ergebnisse', () => {
    const overview = parseVintedActionOverview(
      response([{ ...action, state: 'outcome_unknown' }]),
      scope,
    );
    expect(overview.actions[0]).toMatchObject({ ...action, state: 'outcome_unknown' });
  });
  it('weist fremde Konten und fehlende Scope-Bestätigung zurück', () => {
    expect(() =>
      parseVintedActionOverview({ ...response(), connectionId: 'other' }, scope),
    ).toThrow();
    expect(() =>
      parseVintedActionOverview({ ...response(), workspaceId: 'other' }, scope),
    ).toThrow();
    expect(() => parseVintedActionOverview({ ...response(), ok: false }, scope)).toThrow();
  });
  it.each([
    { state: 'unknown' },
    { priceCents: 1.5 },
    { currency: 'euro' },
    { createdAt: 'invalid' },
    { source: 'sync', kind: 'accept' },
    { id: 'wrong' },
    { partnerName: {} },
  ])('weist beschädigte Aktionsdaten zurück: %o', (changes) => {
    expect(() => parseVintedActionOverview(response([{ ...action, ...changes }]), scope)).toThrow();
  });
  it('weist doppelte Kennungen zurück und akzeptiert fehlende optionale Fachwerte', () => {
    expect(() => parseVintedActionOverview(response([action, action]), scope)).toThrow();
    expect(
      parseVintedActionOverview(
        response([
          {
            ...action,
            conversationId: null,
            messageId: null,
            partnerName: null,
            itemTitle: null,
            priceCents: null,
            currency: null,
          },
        ]),
        scope,
      ).actions,
    ).toHaveLength(1);
  });
  it('trennt echte Ausführung, Warten, Prüfbedarf und abgeschlossene Vorgänge', () => {
    const actions = parseVintedActionOverview(
      response([
        action,
        {
          ...action,
          id: `message:${sourceId}`,
          source: 'message',
          kind: 'message',
          state: 'running',
        },
        {
          ...action,
          id: 'negotiation:25000000-0000-4000-8000-000000000061',
          sourceId: '25000000-0000-4000-8000-000000000061',
          state: 'outcome_unknown',
        },
        {
          ...action,
          id: 'negotiation:25000000-0000-4000-8000-000000000062',
          sourceId: '25000000-0000-4000-8000-000000000062',
          state: 'succeeded',
        },
      ]),
      scope,
    ).actions;
    const groups = groupVintedActions(actions);
    expect(groups.running.map((entry) => entry.state)).toEqual(['running']);
    expect(groups.queued.map((entry) => entry.state)).toEqual(['queued']);
    expect(groups.attention.map((entry) => entry.state)).toEqual(['outcome_unknown']);
    expect(groups.recent.map((entry) => entry.state)).toEqual(['succeeded']);
    expect(describeVintedAction(actions[0])).toBe('Angebot annehmen');
    expect(describeVintedAction(actions[1])).toBe('Nachricht wird gesendet');
    expect(describeVintedAction(actions[2])).not.toContain('angenommen');
    expect(describeVintedAction(actions[3])).toBe('Angebot angenommen');
  });
  it('zeigt alle aktiven Aktionen unabhängig von einer langen Historie', () => {
    const actions = Array.from({ length: 60 }, (_, index) => ({
      ...action,
      sourceId: `25000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      id: `negotiation:25000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }));
    expect(
      groupVintedActions(parseVintedActionOverview(response(actions), scope).actions).queued,
    ).toHaveLength(60);
  });
});
