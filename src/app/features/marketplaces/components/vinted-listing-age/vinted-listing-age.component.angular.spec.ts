import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { VintedListingClockService } from '../../services/vinted-listing-clock.service';
import { VintedListingAgeComponent } from './vinted-listing-age.component';

let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: VintedListingAgeComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-age/vinted-listing-age.component.ts',
    },
    { type: BadgeComponent, path: 'src/app/shared/components/badge/badge.component.ts' },
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
it('aktualisiert Stufe und Wochenziel über die gemeinsame Uhr und bleibt beim Zeitwechsel korrekt', () => {
  const fixture = TestBed.createComponent(VintedListingAgeComponent);
  const clock = TestBed.inject(VintedListingClockService);
  const start = Date.parse('2026-10-01T10:00:00Z');
  fixture.componentRef.setInput('publishedAt', '2026-10-01T10:00:00Z');
  for (const [hours, tone] of [
    [36, 'success'],
    [72, 'caution'],
    [120, 'critical'],
    [168, 'critical'],
  ] as const) {
    clock.now.set(start + hours * 3_600_000);
    fixture.detectChanges();
    expect(fixture.componentInstance.age().tone).toBe(tone);
    expect(fixture.nativeElement.textContent.includes('Wochenziel überschritten')).toBe(
      hours >= 168,
    );
  }
  fixture.componentRef.setInput('compact', true);
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('7 T');
  expect(fixture.nativeElement.textContent).toContain('Wochenziel überschritten');
  expect(fixture.nativeElement.querySelector('[aria-label]').getAttribute('aria-label')).toContain(
    'Wochenziel überschritten',
  );
  fixture.componentRef.setInput('publishedAt', null);
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Alter unbekannt');
});

it('zeigt die gerundete Anbieterangabe ohne erfundene genaue Veröffentlichungszeit', () => {
  const fixture = TestBed.createComponent(VintedListingAgeComponent);
  const clock = TestBed.inject(VintedListingClockService);
  clock.now.set(Date.parse('2026-10-15T10:00:00Z'));
  fixture.componentRef.setInput('publicationAge', {
    value: 2,
    unit: 'day',
    observedAt: '2026-10-15T10:00:00Z',
  });
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('2 Tage online');
  const title = fixture.nativeElement.querySelector('[title]').getAttribute('title');
  expect(title).toContain('Gerundete Angabe von Vinted');
  expect(title).not.toContain('Veröffentlicht:');
  clock.now.update((value) => value + 24 * 3600000);
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('3 Tage online');
});
