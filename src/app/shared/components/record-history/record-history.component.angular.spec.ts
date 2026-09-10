import '@angular/compiler';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BusinessEvent } from '../../../core/models/business-event.models';
import { mapRecordHistoryDetails, RecordHistoryComponent } from './record-history.component';

const event: BusinessEvent = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: 'workspace-1',
  entityType: 'purchase',
  entityId: 'purchase-1',
  eventType: 'purchase_finalized',
  eventLabel: 'Einkauf abgeschlossen',
  actorId: '22222222-2222-4222-8222-222222222222',
  reason: 'Beleg geprüft',
  changes: {
    purchase_price: { before: 100, after: 120 },
    api_token: { before: 'old-secret', after: 'new-secret' },
  },
  correlationId: '33333333-3333-4333-8333-333333333333',
  createdAt: '2026-09-04T10:30:00.000Z',
};

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

function createHistory(inputs: Readonly<Record<string, unknown>> = {}) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [RecordHistoryComponent],
  }).createComponent(RecordHistoryComponent);
  Object.assign(fixture.componentInstance, {
    events: signal<readonly BusinessEvent[]>([]),
    ...Object.fromEntries(Object.entries(inputs).map(([name, value]) => [name, signal(value)])),
  });
  fixture.detectChanges();
  return fixture;
}

describe('RecordHistoryComponent', () => {
  it('zeigt geänderte Positionswerte und neue Kosten aus vollständigen Snapshots', () => {
    expect(
      mapRecordHistoryDetails({
        purchase: { before: { title: 'Einkauf' }, after: { title: 'Einkauf' } },
        lines: {
          before: [{ title_snapshot: 'Tasse', ordered_quantity: 2, unit_purchase_price: 10 }],
          after: [{ title_snapshot: 'Tasse', ordered_quantity: 3, unit_purchase_price: 12 }],
        },
        costs: { before: [], after: [{ amount: 5, description: 'Versand' }] },
      }),
    ).toEqual([
      { label: 'Positionen · Vorher · 1 · Bezeichnung', before: 'Tasse', after: '—' },
      { label: 'Positionen · Vorher · 1 · Menge', before: '2', after: '—' },
      { label: 'Positionen · Vorher · 1 · Stückpreis', before: '10', after: '—' },
      { label: 'Positionen · Nachher · 1 · Bezeichnung', before: '—', after: 'Tasse' },
      { label: 'Positionen · Nachher · 1 · Menge', before: '—', after: '3' },
      { label: 'Positionen · Nachher · 1 · Stückpreis', before: '—', after: '12' },
      { label: 'Kosten · Nachher · 1 · Betrag', before: '—', after: '5' },
      { label: 'Kosten · Nachher · 1 · Beschreibung', before: '—', after: 'Versand' },
    ]);
  });

  it('zeigt erstellte und entfernte Snapshot-Felder und schützt auch verschachtelte Geheimnisse', () => {
    expect(
      mapRecordHistoryDetails({
        purchase: { before: null, after: { title: 'Neuer Einkauf', notes: null } },
        lines: { before: [{ title_snapshot: 'Entfernte Position' }], after: [] },
        authorization: { before: { value: 'secret-old' }, after: { value: 'secret-new' } },
      }),
    ).toEqual([
      { label: 'Einkauf · Bezeichnung', before: '—', after: 'Neuer Einkauf' },
      { label: 'Positionen · Vorher · 1 · Bezeichnung', before: 'Entfernte Position', after: '—' },
      { label: 'Authorization', before: '[geschützt]', after: '[geschützt]' },
    ]);
  });

  it('verknüpft umsortierte Kosten nicht fälschlich mit einem anderen Kosteneintrag', () => {
    expect(
      mapRecordHistoryDetails({
        costs: {
          before: [
            { description: 'A', amount: 1 },
            { description: 'B', amount: 2 },
          ],
          after: [
            { amount: 2, description: 'B' },
            { description: 'A', amount: 3 },
          ],
        },
      }),
    ).toEqual([
      { label: 'Kosten · Vorher · 1 · Beschreibung', before: 'A', after: '—' },
      { label: 'Kosten · Vorher · 1 · Betrag', before: '1', after: '—' },
      { label: 'Kosten · Nachher · 2 · Beschreibung', before: '—', after: 'A' },
      { label: 'Kosten · Nachher · 2 · Betrag', before: '—', after: '3' },
    ]);
  });

  it('zeigt bei eingefügten Positionen keine Änderung der nachfolgenden Positionen', () => {
    expect(
      mapRecordHistoryDetails({
        lines: {
          before: [{ title_snapshot: 'B' }],
          after: [{ title_snapshot: 'A' }, { title_snapshot: 'B' }],
        },
      }),
    ).toEqual([{ label: 'Positionen · Nachher · 1 · Bezeichnung', before: '—', after: 'A' }]);
  });

  it('gleicht gleiche Einträge einzeln ab und erhält zusätzliche Duplikate', () => {
    expect(
      mapRecordHistoryDetails({
        costs: {
          before: [{ amount: 1 }, { amount: 1 }, { amount: 1 }, { amount: 2 }],
          after: [{ amount: 1 }, { amount: 2 }, { amount: 2 }],
        },
      }),
    ).toEqual([
      { label: 'Kosten · Vorher · 2 · Betrag', before: '1', after: '—' },
      { label: 'Kosten · Vorher · 3 · Betrag', before: '1', after: '—' },
      { label: 'Kosten · Nachher · 3 · Betrag', before: '—', after: '2' },
    ]);
  });

  it('zeigt während des Ladens einen verständlichen Status', () => {
    const fixture = createHistory({ loading: true });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Änderungsverlauf wird geladen',
    );
  });

  it('zeigt für einen leeren Verlauf einen verständlichen Hinweis', () => {
    const fixture = createHistory();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Noch keine Änderungen protokolliert',
    );
  });

  it('meldet einen Ladefehler und löst über Wiederholen einen neuen Versuch aus', () => {
    const fixture = createHistory({ error: 'Offline' });
    const retry = vi.fn();
    fixture.componentInstance.retryRequested.subscribe(retry);

    const retryButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button',
    );
    retryButton?.click();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Offline');
    expect(retry).toHaveBeenCalledOnce();
  });

  it('zeigt einen vorhandenen Verlauf mit Vorgang, Person und Zeitpunkt', () => {
    const fixture = createHistory({ events: [event] });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Einkauf abgeschlossen');
    expect(text).toContain(event.actorId!);
    expect(text).toContain('04.09.2026');
    expect(text).toContain('Zuletzt geändert am');
    expect(text).not.toContain('"purchase_price"');
  });

  it('zeigt Details erst auf Wunsch und schützt geheime Werte', () => {
    const fixture = createHistory({ events: [event] });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).not.toContain('old-secret');
    host.querySelector<HTMLButtonElement>('[aria-expanded]')?.click();
    fixture.detectChanges();

    expect(host.textContent).toContain('Einkaufspreis');
    expect(host.textContent).toContain('100');
    expect(host.textContent).toContain('120');
    expect(host.textContent).toContain('[geschützt]');
    expect(host.textContent).not.toContain('old-secret');
    expect(host.textContent).not.toContain('new-secret');
  });

  it('lädt bei einer weiteren Seite erst nach einem ausdrücklichen Klick nach', () => {
    const fixture = createHistory({ events: [event], hasMore: true });
    const loadMore = vi.fn();
    fixture.componentInstance.loadMoreRequested.subscribe(loadMore);

    const button = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ].find((candidate) => candidate.textContent?.includes('Weitere Änderungen laden'));
    button?.click();

    expect(loadMore).toHaveBeenCalledOnce();
  });
});
