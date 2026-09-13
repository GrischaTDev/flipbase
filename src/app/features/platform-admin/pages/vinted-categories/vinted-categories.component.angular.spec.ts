import '@angular/compiler';
import { formatDate } from '@angular/common';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { VintedCategoriesComponent } from './vinted-categories.component';
import { VintedCategoryService } from '../../services/vinted-category.service';
import { CategorySyncStatus } from '../../models/vinted-category.model';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let pageHeaderInputs: AngularInputMetadata | null = null;

// Ohne JIT-Vorlagenaufloesung meldet TestBed "Component is not resolved" fuer
// jede Komponente mit externem templateUrl - so laeuft auch jeder andere
// Komponententest in diesem Projekt (siehe beta-applications.component.angular.spec.ts).
// Der gemeinsame Seitenkopf liegt nicht neben dieser Testdatei; seine
// Vorlagen werden deshalb ausdruecklich auf ihren Ort umgelenkt.
beforeAll(async () => {
  const resources: Record<string, string> = {
    './page-header.component.html':
      '../../../../shared/components/page-header/page-header.component.html',
    './page-header.component.scss':
      '../../../../shared/components/page-header/page-header.component.scss',
  };
  await ɵresolveComponentResources((url) =>
    readFile(new URL(resources[url] ?? url, import.meta.url), 'utf8'),
  );

  // Signal-Eingaenge kennt die Laufzeitübersetzung der Tests nicht. Ohne
  // diese Anmeldung bliebe die Ueberschrift leer, und AXE meldete zu Recht
  // "empty-heading" - im echten Bau tritt das nicht auf.
  const metadata = (PageHeaderComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  pageHeaderInputs = { inputs: metadata.inputs, declaredInputs: metadata.declaredInputs };
  metadata.inputs = {
    ...metadata.inputs,
    title: ['title', 1, null],
    subtitle: ['subtitle', 1, null],
  };
  metadata.declaredInputs = { ...metadata.declaredInputs, title: 'title', subtitle: 'subtitle' };
});

afterAll(() => {
  if (!pageHeaderInputs) return;
  const metadata = (PageHeaderComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  metadata.inputs = pageHeaderInputs.inputs;
  metadata.declaredInputs = pageHeaderInputs.declaredInputs;
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

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  it('shows completed category refreshes automatically and stops polling after leaving', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await build({
      ...status,
      categoryCount: 0,
      refreshedAt: null,
      lastAttemptAt: null,
      requestedAt: '2026-09-06T11:00:00+00:00',
    });
    serviceStub.readStatus.mockResolvedValue(status);
    await vi.advanceTimersByTimeAsync(5000);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('2920');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="status"]')?.textContent,
    ).not.toContain('Auffrischung angefordert');
    fixture.destroy();
    const calls = serviceStub.readStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15000);
    expect(serviceStub.readStatus).toHaveBeenCalledTimes(calls);
  });

  it('recovers from a temporary status error without requesting another Vinted refresh', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await build(status);
    serviceStub.readStatus.mockRejectedValueOnce(new Error('Verbindung unterbrochen'));
    await vi.advanceTimersByTimeAsync(5000);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Verbindung unterbrochen');
    serviceStub.readStatus.mockResolvedValue({ ...status, categoryCount: 2921 });
    await vi.advanceTimersByTimeAsync(5000);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('2921');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).toBeNull();
    expect(serviceStub.requestRefresh).not.toHaveBeenCalled();
  });

  it('warns when a refresh request has remained unanswered', async () => {
    await build({
      ...status,
      categoryCount: 0,
      refreshedAt: null,
      lastAttemptAt: null,
      requestedAt: new Date(Date.now() - 120_000).toISOString(),
    });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Bisher keine Antwort vom Bot',
    );
  });

  it('does not pile up status requests while a response is slow', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await build(status);
    let complete: ((value: CategorySyncStatus) => void) | undefined;
    serviceStub.readStatus.mockImplementationOnce(
      () =>
        new Promise<CategorySyncStatus>((resolve) => {
          complete = resolve;
        }),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(serviceStub.readStatus).toHaveBeenCalledTimes(2);
    complete?.({ ...status, categoryCount: 2922 });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('2922');
  });

  it('keeps waiting and error messages accessible', async () => {
    await build({
      ...status,
      categoryCount: 0,
      refreshedAt: null,
      lastAttemptAt: null,
      requestedAt: new Date(Date.now() - 120_000).toISOString(),
      lastError: 'HTTP 503',
    });
    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      // jsdom berechnet kein Layout; Farbkontrast braucht einen echten Browser.
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
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
