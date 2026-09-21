import { describe, expect, it } from 'vitest';
import { mapRecordChanges } from './record-changes';

describe('mapRecordChanges', () => {
  it('vergleicht einfache Felder', () => {
    expect(mapRecordChanges({ purchase_price: { before: 100, after: 120 } })).toEqual([
      { label: 'Einkaufspreis', from: '100,00 €', to: '120,00 €' },
    ]);
  });

  it('übersetzt fachliche Werte statt ihrer technischen Codes', () => {
    expect(
      mapRecordChanges({
        receiving_status: { before: 'ordered', after: 'received' },
        condition_snapshot: { before: 'used', after: 'very_good' },
        cost_allocation_mode: { before: 'even', after: 'value_weighted' },
        tracking_carrier: { before: 'dhl', after: 'deutsche_post' },
      }),
    ).toEqual([
      { label: 'Wareneingang', from: 'Bestellt', to: 'Angekommen' },
      { label: 'Zustand', from: 'Gebraucht', to: 'Sehr gut' },
      { label: 'Kostenverteilung', from: 'Gleichmäßig', to: 'Nach Artikelwert' },
      { label: 'Versanddienstleister', from: 'DHL Paket', to: 'Deutsche Post' },
    ]);
  });

  it('führt verschachtelte Werte einzeln statt als Sammelwert auf', () => {
    const changes = mapRecordChanges({
      purchase: {
        before: { costs: { shipping_cost: 4.9, other_costs: 0 } },
        after: { costs: { shipping_cost: 6.5, other_costs: 2 } },
      },
    });

    expect(changes).toEqual([
      { label: 'Kosten · Versandkosten', from: '4,90 €', to: '6,50 €' },
      { label: 'Kosten · Sonstige Kosten', from: '0,00 €', to: '2,00 €' },
    ]);
    expect(changes.flatMap((change) => [change.from, change.to])).not.toContain('Mehrere Werte');
  });

  it('lässt unveränderte Felder weg', () => {
    const changes = {
      purchase: {
        before: { notes: 'gleich', purchase_date: '2026-09-01' },
        after: { notes: 'gleich', purchase_date: '2026-09-03' },
      },
    };
    expect(mapRecordChanges(changes)).toEqual([
      { label: 'Einkaufsdatum', from: '01.09.2026', to: '03.09.2026' },
    ]);
  });

  it('schützt sensible Schlüssel', () => {
    expect(mapRecordChanges({ api_token: { before: 'alt', after: 'neu' } })).toEqual([
      { label: 'Api token', from: '[geschützt]', to: '[geschützt]' },
    ]);
  });

  it('vergleicht Listen an ihrer Stelle', () => {
    const changes = {
      lines: {
        before: [{ title: 'Jacke', ordered_quantity: 1 }, { title: 'Hose' }],
        after: [{ title: 'Jacke', ordered_quantity: 2 }, { title: 'Hose' }],
      },
    };
    expect(mapRecordChanges(changes)).toEqual([
      { label: 'Position 1 · Menge', from: '1', to: '2' },
    ]);
  });

  it('meldet Zugänge und Abgänge einer Liste als eine Zeile', () => {
    const changes = {
      lines: {
        before: [{ title: 'Jacke' }],
        after: [{ title: 'Jacke' }, { title: 'Hose' }],
      },
      costs: {
        before: [{ description: 'Versand', amount: 4.9 }],
        after: [],
      },
    };
    expect(mapRecordChanges(changes)).toEqual([
      { label: 'Position 2 hinzugefügt', from: null, to: 'Hose' },
      { label: 'Kostenposition 1 entfernt', from: 'Versand', to: null },
    ]);
  });

  it('nennt Zugänge ohne Bezeichnung nur beim Namen der Stelle', () => {
    const changes = { lines: { before: [], after: [{ ordered_quantity: 2 }] } };
    expect(mapRecordChanges(changes)).toEqual([
      { label: 'Position 1 hinzugefügt', from: null, to: null },
    ]);
  });

  it('zeigt fehlende Werte als Gedankenstrich', () => {
    expect(mapRecordChanges({ notes: { before: null, after: 'neu' } })).toEqual([
      { label: 'Notizen', from: '—', to: 'neu' },
    ]);
  });

  it('schreibt gespeicherte ISO-Daten lesbar aus', () => {
    expect(
      mapRecordChanges({ purchase_date: { before: '2026-09-01', after: '2026-09-03' } }),
    ).toEqual([{ label: 'Einkaufsdatum', from: '01.09.2026', to: '03.09.2026' }]);
    const stamps = mapRecordChanges({
      returned_at: { before: null, after: '2026-09-03T08:30:00.000Z' },
    });
    expect(stamps[0]?.to).toMatch(/^03\.09\.2026, \d{2}:\d{2}$/u);
  });

  it('lässt Texte, die nur an ein Datum erinnern, unverändert', () => {
    expect(mapRecordChanges({ notes: { before: null, after: '2026-09' } })).toEqual([
      { label: 'Notizen', from: '—', to: '2026-09' },
    ]);
  });

  it('gibt bei fehlenden Änderungen eine leere Liste zurück', () => {
    expect(mapRecordChanges(null)).toEqual([]);
    expect(mapRecordChanges({ purchase_price: { before: 100, after: 100 } })).toEqual([]);
  });
});
