import { describe, expect, it } from 'vitest';
import { BusinessEvent } from '../../../core/models/business-event.models';
import { Json } from '../../../core/models/supabase.types';
import { timelineChanges, timelineSentence } from './timeline-sentence';

function createEvent(eventType: string, changes: Json = {}, actorId: string | null = 'actor-1') {
  return {
    id: 'event-1',
    workspaceId: 'workspace-1',
    entityType: 'purchase',
    entityId: 'purchase-1',
    eventType,
    eventLabel: 'Etikett aus der Zuordnung',
    actorId,
    reason: null,
    changes,
    correlationId: 'correlation-1',
    createdAt: '2026-09-12T10:00:00.000Z',
  } satisfies BusinessEvent;
}

describe('timelineSentence', () => {
  it('spricht den angemeldeten Verursacher direkt an', () => {
    const sentence = timelineSentence(createEvent('purchase_ordered'), 'Grischa Tänzer', 'actor-1');
    expect(sentence).toBe('Du hast diesen Einkauf als bestellt markiert.');
  });

  it('beschreibt einen Nachtrag der Verkäuferangaben', () => {
    const sentence = timelineSentence(
      createEvent('purchase_seller_details_updated'),
      'Lena Meyer',
      'actor-2',
    );
    expect(sentence).toBe('Lena Meyer hat die Verkäuferangaben ergänzt.');
  });

  it('beschreibt einen hinzugefügten und einen entfernten Beleg', () => {
    expect(timelineSentence(createEvent('purchase_document_added'), 'Lena Meyer', 'actor-2')).toBe(
      'Lena Meyer hat einen Beleg hinzugefügt.',
    );
    expect(
      timelineSentence(createEvent('purchase_document_removed'), 'Lena Meyer', 'actor-1'),
    ).toBe('Du hast einen Beleg entfernt.');
  });

  it('nennt fremde Verursacher beim Namen', () => {
    const sentence = timelineSentence(createEvent('purchase_ordered'), 'Lena Meyer', 'actor-2');
    expect(sentence).toBe('Lena Meyer hat diesen Einkauf als bestellt markiert.');
  });

  it('nennt das System, wenn kein Verursacher hinterlegt ist', () => {
    const event = createEvent('purchase_costing_legacy_migrated', {}, null);
    expect(timelineSentence(event, 'Mitglied', 'actor-1')).toBe(
      'Das System hat Altdaten dieses Einkaufs übernommen.',
    );
  });

  it('erfindet für unbekannte Ereignisse keinen Satz', () => {
    const sentence = timelineSentence(createEvent('purchase_teleported'), 'Lena Meyer', 'actor-2');
    expect(sentence).toBe('Lena Meyer · Etikett aus der Zuordnung');
  });

  it('bleibt auch ohne Verursacher bei unbekannten Ereignissen sachlich', () => {
    const event = createEvent('purchase_teleported', {}, null);
    expect(timelineSentence(event, 'Mitglied', 'actor-1')).toBe(
      'Das System · Etikett aus der Zuordnung',
    );
  });
});

describe('timelineChanges', () => {
  it('nennt beim Erfassen von Paketinhalt nur die neuen Artikel', () => {
    const event = createEvent('purchase_package_contents_captured', {
      source_package_line_id: 'pack',
      request_id: 'request',
      inventory_items: [
        { id: 'a', title: 'Adidas Samba', status: 'received', allocated_purchase_cost: null },
        { id: 'b', title: 'Adidas Gazelle', status: 'received' },
      ],
    });
    expect(timelineSentence(event, 'Grischa', 'actor-1')).toBe('Du hast Paketinhalt erfasst.');
    expect(timelineChanges(event)).toEqual([
      { label: 'Artikel erfasst', from: null, to: 'Adidas Samba' },
      { label: 'Artikel erfasst', from: null, to: 'Adidas Gazelle' },
    ]);
  });
  it('zeigt beim Anlegen eines Entwurfs keine Details', () => {
    const event = createEvent('purchase_draft_created', {
      purchase: { before: null, after: { purchase_date: '2026-09-01', notes: 'Testeinkauf' } },
      lines: { before: null, after: [{ title: 'Jacke', ordered_quantity: 1 }] },
    });
    expect(timelineChanges(event)).toEqual([]);
  });

  it('verschweigt den Status, den der Satz schon ausspricht', () => {
    const event = createEvent('purchase_ordered', {
      receiving_status: { before: 'draft', after: 'ordered' },
      shipment_status: { before: null, after: 'not_shipped' },
      arrived_at: { before: '2026-09-01T08:00:00.000Z', after: null },
    });
    expect(timelineChanges(event)).toEqual([]);
  });

  it('nennt echte Änderungen als alt und neu', () => {
    const event = createEvent('purchase_draft_updated', {
      purchase: {
        before: { purchase_date: '2026-09-01', notes: null },
        after: { purchase_date: '2026-09-03', notes: 'Versand am Montag' },
      },
    });
    expect(timelineChanges(event)).toEqual([
      { label: 'Einkaufsdatum', from: '01.09.2026', to: '03.09.2026' },
      { label: 'Beschreibung', from: '—', to: 'Versand am Montag' },
    ]);
  });

  it('lässt technische Kennungen und Zeitstempel weg', () => {
    const event = createEvent('purchase_draft_updated', {
      purchase: {
        before: {
          id: '11111111-1111-4111-8111-111111111111',
          supplier_id: '11111111-1111-4111-8111-111111111111',
          updated_at: '2026-09-01T08:00:00.000Z',
          notes: 'alt',
        },
        after: {
          id: '22222222-2222-4222-8222-222222222222',
          supplier_id: '22222222-2222-4222-8222-222222222222',
          updated_at: '2026-09-03T08:00:00.000Z',
          notes: 'neu',
        },
      },
    });
    expect(timelineChanges(event)).toEqual([{ label: 'Beschreibung', from: 'alt', to: 'neu' }]);
  });

  it('vermerkt sensible Änderungen, ohne den Wert zu zeigen', () => {
    const event = createEvent('purchase_draft_updated', {
      purchase: {
        before: { api_token: 'alt-geheim', notes: 'alt' },
        after: { api_token: 'neu-geheim', notes: 'neu' },
      },
    });
    expect(timelineChanges(event)).toEqual([
      { label: 'Api token', from: '[geschützt]', to: '[geschützt]' },
      { label: 'Beschreibung', from: 'alt', to: 'neu' },
    ]);
  });

  it('führt geänderte Positionen an ihrer Stelle und neue Positionen als Zugang', () => {
    const event = createEvent('purchase_draft_updated', {
      lines: {
        before: [{ title: 'Jacke', ordered_quantity: 1 }],
        after: [
          { title: 'Jacke', ordered_quantity: 3 },
          { title: 'Hose', ordered_quantity: 1 },
        ],
      },
    });
    expect(timelineChanges(event)).toEqual([
      { label: 'Position 1 · Menge', from: '1', to: '3' },
      { label: 'Position 2 hinzugefügt', from: null, to: 'Hose' },
    ]);
  });

  it('meldet entfernte Positionen mit ihrer Bezeichnung', () => {
    const event = createEvent('purchase_draft_updated', {
      lines: {
        before: [{ title: 'Jacke' }, { title: 'Hose' }],
        after: [{ title: 'Jacke' }],
      },
    });
    expect(timelineChanges(event)).toEqual([
      { label: 'Position 2 entfernt', from: 'Hose', to: null },
    ]);
  });

  it('zeigt einen hinzugefügten Beleg genau einmal und ohne technische Kennung', () => {
    const event = createEvent('purchase_document_added', {
      document_id: '11111111-1111-4111-8111-111111111111',
      original_file_name: 'rechnung.pdf',
      document_type: 'invoice',
    });

    expect(timelineChanges(event)).toEqual([
      { label: 'Beleg hinzugefügt', from: null, to: 'rechnung.pdf · Rechnung' },
    ]);
  });

  it('zeigt einen entfernten Beleg genau einmal und ohne technische Kennung', () => {
    const event = createEvent('purchase_document_removed', {
      document_id: '22222222-2222-4222-8222-222222222222',
      original_file_name: 'quittung.jpg',
      document_type: 'purchase_proof',
    });

    expect(timelineChanges(event)).toEqual([
      { label: 'Beleg entfernt', from: 'quittung.jpg · Kaufnachweis', to: null },
    ]);
  });
});
