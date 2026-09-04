import '@angular/compiler';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BusinessEvent } from '../../../core/models/business-event.models';
import { RecordHistoryComponent } from './record-history.component';

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
