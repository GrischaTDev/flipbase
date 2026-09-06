import '@angular/compiler';
import { formatDate } from '@angular/common';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { VintedCategoriesComponent } from './vinted-categories.component';
import { VintedCategoryService } from '../../services/vinted-category.service';
import { CategorySyncStatus } from '../../models/vinted-category.model';

// Ohne JIT-Vorlagenaufloesung meldet TestBed "Component is not resolved" fuer
// jede Komponente mit externem templateUrl - so laeuft auch jeder andere
// Komponententest in diesem Projekt (siehe beta-applications.component.angular.spec.ts).
beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

/**
 * Erwartete Anzeige eines Zeitpunkts.
 *
 * Bewusst berechnet statt fest hingeschrieben: Die DatePipe rechnet in die
 * Zeitzone des laufenden Rechners um. Ein fest eingetragenes "15:00" waere in
 * Berlin gruen und auf einem CI-Laeufer in UTC rot - der Test pruefte dann die
 * Zeitzone und nicht die Anzeige.
 */
function shown(iso: string): string {
  return formatDate(iso, 'dd.MM.yyyy, HH:mm', 'en-US');
}

const status: CategorySyncStatus = {
  refreshedAt: '2026-09-06T12:00:00+00:00',
  requestedAt: null,
  lastAttemptAt: '2026-09-06T12:00:00+00:00',
  categoryCount: 2920,
  lastError: null,
};

describe('VintedCategoriesComponent', () => {
  let fixture: ComponentFixture<VintedCategoriesComponent>;
  let serviceStub: {
    readStatus: ReturnType<typeof vi.fn>;
    requestRefresh: ReturnType<typeof vi.fn>;
  };

  const build = async (initial: CategorySyncStatus): Promise<void> => {
    serviceStub = {
      readStatus: vi.fn(async () => initial),
      requestRefresh: vi.fn(async () => undefined),
    };

    await TestBed.configureTestingModule({
      imports: [VintedCategoriesComponent],
      providers: [{ provide: VintedCategoryService, useValue: serviceStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(VintedCategoriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('zeigt die Zahl der Kategorien und den Zeitpunkt des letzten Einlesens', async () => {
    await build(status);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('2920');
  });

  it('fordert beim Knopfdruck eine Auffrischung an', async () => {
    await build(status);

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[data-testid="request-refresh"]',
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    expect(serviceStub.requestRefresh).toHaveBeenCalledOnce();
  });

  it('zeigt den letzten Fehler an, wenn einer vorliegt', async () => {
    await build({ ...status, lastError: 'Kein catalogTree im HTML gefunden' });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Kein catalogTree im HTML gefunden');
  });

  it('sagt es deutlich, wenn noch nie eingelesen wurde', async () => {
    await build({ ...status, refreshedAt: null, categoryCount: 0 });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Noch nie eingelesen');
  });

  // Ohne diesen Zeitpunkt ist "der Dienst hat es um 13:00 versucht und ist
  // gescheitert" nicht von "der Dienst laeuft gar nicht mehr" zu
  // unterscheiden.
  it('zeigt, wann der Dienst es zuletzt versucht hat', async () => {
    await build({
      ...status,
      refreshedAt: '2026-09-06T10:00:00+00:00',
      lastAttemptAt: '2026-09-06T13:00:00+00:00',
      lastError: 'Kein catalogTree im HTML gefunden',
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Letzter Versuch');
    // Zweimal derselbe Zeitpunkt: einmal als Kennzahl, einmal im Fehlerkasten.
    expect(text.split(shown('2026-09-06T13:00:00+00:00'))).toHaveLength(3);
  });

  // Der eigentliche Befund: Der Hinweis hing allein am lokalen Signal und war
  // nach einem Seitenwechsel weg. Hier wird die Seite frisch aufgebaut, ohne
  // dass je ein Knopf gedrueckt wurde.
  it('zeigt eine offene Anforderung auch ohne vorherigen Knopfdruck', async () => {
    await build({
      ...status,
      refreshedAt: '2026-09-06T10:00:00+00:00',
      lastAttemptAt: '2026-09-06T10:00:00+00:00',
      requestedAt: '2026-09-06T11:00:00+00:00',
    });

    const live = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');

    expect(live?.textContent).toContain(
      `Auffrischung angefordert am ${shown('2026-09-06T11:00:00+00:00')} Uhr`,
    );
  });

  // Die Gegenrichtung: Hat der Dienst die Anforderung abgearbeitet, ist sie
  // nicht mehr offen. Ohne diesen Fall bliebe der Test oben auch dann gruen,
  // wenn jeder gesetzte Zeitstempel als offene Anforderung gaelte.
  it('zeigt keine offene Anforderung, wenn der Dienst sie schon versucht hat', async () => {
    await build({
      ...status,
      refreshedAt: '2026-09-06T10:00:00+00:00',
      requestedAt: '2026-09-06T11:00:00+00:00',
      lastAttemptAt: '2026-09-06T11:30:00+00:00',
      lastError: 'HTTP 503',
    });

    const live = (fixture.nativeElement as HTMLElement).querySelector('[role="status"]');

    expect(live?.textContent).not.toContain('Auffrischung angefordert');
  });
});
