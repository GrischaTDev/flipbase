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
it('behält belegte Vinted-Tage auch bei unbekanntem Status ohne Onlinebehauptung sichtbar', () => {
  const fixture = TestBed.createComponent(VintedListingAgeComponent);
  TestBed.inject(VintedListingClockService).now.set(Date.parse('2026-10-23T10:00:00Z'));
  fixture.componentRef.setInput('publicationState', 'unknown');
  fixture.componentRef.setInput('publicationAge', {
    value: 2,
    unit: 'day',
    observedAt: '2026-10-21T10:00:00Z',
  });
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('4 Tage');
  expect(fixture.nativeElement.textContent).not.toContain('unbekannt');
  expect(fixture.nativeElement.textContent).not.toContain('online');
  expect(fixture.nativeElement.querySelector('[title]').getAttribute('title')).toContain('Vinted');
  fixture.componentRef.setInput('compact', true);
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('4 T');
});
it('zeigt das Erstellalter eines Entwurfs ohne Online-Alter und ohne Veröffentlichungsdatum', () => {
  const fixture = TestBed.createComponent(VintedListingAgeComponent);
  const clock = TestBed.inject(VintedListingClockService);
  clock.now.set(Date.parse('2026-10-22T10:00:00Z'));
  fixture.componentRef.setInput('publicationState', 'draft');
  fixture.componentRef.setInput('createdAt', '2026-10-20T10:00:00Z');
  fixture.componentRef.setInput('publishedAt', '2026-10-01T10:00:00Z');
  fixture.componentRef.setInput('publicationAge', {
    value: 21,
    unit: 'day',
    observedAt: '2026-10-22T10:00:00Z',
  });
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Vor 2 Tagen erstellt');
  expect(fixture.nativeElement.textContent).not.toContain('online');
  const title = fixture.nativeElement.querySelector('[title]').getAttribute('title');
  expect(title).toContain('Erstellt:');
  expect(title).not.toContain('Veröffentlicht');
  expect(fixture.componentInstance.age().tone).toBe('neutral');
  fixture.componentRef.setInput('compact', true);
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('2 T · erstellt');
});

it('unterscheidet bei einem aktiven Artikel Erstellung und spätere Veröffentlichung', () => {
  const fixture = TestBed.createComponent(VintedListingAgeComponent);
  TestBed.inject(VintedListingClockService).now.set(Date.parse('2026-10-22T10:00:00Z'));
  fixture.componentRef.setInput('publicationState', 'active');
  fixture.componentRef.setInput('createdAt', '2026-10-01T10:00:00Z');
  fixture.componentRef.setInput('publishedAt', '2026-10-20T10:00:00Z');
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('2 Tage online');
  const title = fixture.nativeElement.querySelector('[title]').getAttribute('title');
  expect(title).toContain('Veröffentlicht:');
  expect(title).toContain('Erstellt:');
});
it('aktualisiert Altersfarbe ohne Wochenzieltext und erhält das zugängliche Alter', () => {
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
    expect(fixture.nativeElement.textContent).not.toContain('Wochenziel überschritten');
  }
  fixture.componentRef.setInput('compact', true);
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('7 T');
  expect(fixture.nativeElement.textContent).not.toContain('Wochenziel überschritten');
  expect(fixture.nativeElement.querySelector('[aria-label]').getAttribute('aria-label')).toContain(
    '7 Tage online',
  );
  expect(fixture.nativeElement.querySelector('[title]').getAttribute('title')).not.toContain(
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

it('zeigt ein belegtes Veröffentlichungsdatum nur taggenau und wechselt am Berliner Tageswechsel', () => {
  const fixture = TestBed.createComponent(VintedListingAgeComponent);
  const clock = TestBed.inject(VintedListingClockService);
  clock.now.set(Date.parse('2026-10-16T21:59:00Z'));
  fixture.componentRef.setInput('publishedOn', '2026-10-15');
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('1 Tag online');
  const title = fixture.nativeElement.querySelector('[title]').getAttribute('title');
  expect(title).toContain('15.10.2026');
  expect(title).not.toContain('00:00');
  expect(title).not.toContain('Vinted');
  clock.now.set(Date.parse('2026-10-16T22:00:00Z'));
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('2 Tage online');
  fixture.componentRef.setInput('publishedOn', '2026-02-30');
  fixture.detectChanges();
  expect(fixture.nativeElement.textContent).toContain('Inseratsalter unbekannt');
});
