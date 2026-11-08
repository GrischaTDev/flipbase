import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import axe from 'axe-core';
import { BehaviorSubject } from 'rxjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { parsePlatformErrorEvents } from '../../models/platform-error-log';
import { PlatformErrorLogService } from '../../services/platform-error-log.service';
import { PlatformErrorLogComponent } from './platform-error-log.component';

const row = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  occurredAt: '2026-11-06T15:26:12Z',
  severity: 'error',
  source: 'marketplace_operations',
  code: 'cleanup',
  accountLabel: 'Wiehen Store',
  workspaceName: 'Flipbase',
  detail: { authorization_kind: 'scheduled_read' },
  ...extra,
});

describe('PlatformErrorLogComponent', () => {
  let restoreBindings: (() => void) | undefined;
  beforeAll(async () => {
    restoreBindings = await prepareMarketplaceRendering([
      {
        type: PlatformErrorLogComponent,
        path: 'src/app/features/platform-admin/pages/platform-error-log/platform-error-log.component.ts',
      },
    ]);
  });
  afterAll(() => restoreBindings?.());
  afterEach(() => TestBed.resetTestingModule());

  async function render(area: string, list: ReturnType<typeof vi.fn>) {
    const params = new BehaviorSubject(convertToParamMap({ area }));
    await TestBed.configureTestingModule({
      imports: [PlatformErrorLogComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        { provide: PlatformErrorLogService, useValue: { list } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformErrorLogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, params };
  }

  it('zeigt jeden Abbruch mit Zeit, Konto, Quelle, Fehler und Details', async () => {
    const list = vi.fn(async () => parsePlatformErrorEvents([row(1)]));
    const { element } = await render('vinted-sync', list);
    expect(list).toHaveBeenCalledWith('vinted_sync');
    expect(element.querySelector('h1')?.textContent).toContain('Vinted-Abrufe');
    const cells = Array.from(
      element.querySelectorAll('[data-platform-error-table] tbody td'),
      (cell) => cell.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(cells[0]).toMatch(/06\.11\.2026, \d{2}:26:12/);
    expect(cells[1]).toBe('Fehler');
    expect(
      Array.from(
        element.querySelectorAll('[data-platform-error-table] tbody td:nth-child(3) span'),
        (span) => span.textContent?.trim(),
      ),
    ).toEqual(['Wiehen Store', 'Flipbase']);
    expect(cells[3]).toBe('Kontoabruf');
    expect(cells[4]).toContain('Browsersitzung noch nicht beendet');
    expect(element.querySelector('[data-platform-error-table] code')?.textContent).toBe('cleanup');
    expect(element.querySelector('[data-platform-error-table] dt')?.textContent).toBe('Auslöser');
    expect(element.querySelector('[data-platform-error-table] dd')?.textContent).toBe('Automatik');
    const result = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it('lädt ältere Einträge ab dem letzten sichtbaren nach', async () => {
    const first = Array.from({ length: 100 }, (_, index) => row(200 - index));
    const list = vi
      .fn()
      .mockResolvedValueOnce(parsePlatformErrorEvents(first))
      .mockResolvedValueOnce(parsePlatformErrorEvents([row(50)]));
    const { fixture, element } = await render('vinted-sync', list);
    const more = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Ältere laden'),
    )!;
    more.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(list).toHaveBeenLastCalledWith('vinted_sync', 101);
    expect(element.querySelectorAll('[data-platform-error-table] tbody tr')).toHaveLength(101);
    expect(element.textContent).not.toContain('Ältere laden');
  });

  it('meldet leere Bereiche, Ladefehler und unbekannte Adressen verständlich', async () => {
    const empty = await render(
      'push',
      vi.fn(async () => []),
    );
    expect(empty.element.textContent).toContain('Keine Fehler in den letzten 30 Tagen');
    TestBed.resetTestingModule();

    const failed = await render(
      'app',
      vi.fn(async () => {
        throw new Error('42501');
      }),
    );
    expect(failed.element.querySelector('[role="alert"]')?.textContent).toContain(
      'Das Fehlerprotokoll konnte nicht geladen werden.',
    );
    TestBed.resetTestingModule();

    const unknown = await render('gibt-es-nicht', vi.fn());
    expect(unknown.element.textContent).toContain('Diesen Bereich gibt es nicht.');
  });
});
