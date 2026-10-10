import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { VintedListingScheduleDialogComponent } from './vinted-listing-schedule-dialog.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';

let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: VintedListingScheduleDialogComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-schedule-dialog/vinted-listing-schedule-dialog.component.ts',
    },
    {
      type: ModalShellComponent,
      path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
    },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    {
      type: DatePickerComponent,
      path: 'src/app/shared/components/date-picker/date-picker.component.ts',
    },
    {
      type: TextFieldComponent,
      path: 'src/app/shared/components/text-field/text-field.component.ts',
    },
    {
      type: CustomSelectComponent,
      path: 'src/app/shared/components/custom-select/custom-select.component.ts',
    },
    {
      type: NoticeBannerComponent,
      path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
function setup() {
  TestBed.configureTestingModule({ imports: [VintedListingScheduleDialogComponent] });
  const fixture = TestBed.createComponent(VintedListingScheduleDialogComponent);
  fixture.componentRef.setInput('now', () => Date.parse('2026-10-10T12:00:00Z'));
  fixture.detectChanges();
  const selected = vi.fn();
  fixture.componentInstance.selected.subscribe(selected);
  return { fixture, component: fixture.componentInstance, selected };
}
describe('Vinted listing schedule dialog', () => {
  it('shows the duplicated hour even when the zone has surrounding spaces', () => {
    const f = setup();
    f.component.form.patchValue({ date: '2026-10-25', time: '02:30', timeZone: ' Europe/Berlin ' });
    expect(f.component.resolution().kind).toBe('ambiguous');
  });
  it('restores the later occurrence from a saved plan', () => {
    const f = setup();
    f.fixture.componentRef.setInput('initial', {
      scheduledAt: '2026-10-25T01:30:00Z',
      timeZone: 'Europe/Berlin',
      latePolicy: 'publish_when_available',
    });
    f.fixture.detectChanges();
    expect(f.component.form.controls.occurrence.value).toBe('later');
    f.component.submit();
    expect(f.selected).toHaveBeenCalledWith({
      scheduledAt: '2026-10-25T01:30:00.000Z',
      timeZone: 'Europe/Berlin',
      latePolicy: 'publish_when_available',
    });
  });
  it('emits a future UTC instant with the explicit zone and selected outage rule', () => {
    const f = setup();
    f.component.form.patchValue({ date: '2026-10-11', time: '18:30', timeZone: 'Europe/Berlin' });
    f.component.submit();
    expect(f.selected).toHaveBeenCalledWith({
      scheduledAt: '2026-10-11T16:30:00.000Z',
      timeZone: 'Europe/Berlin',
      latePolicy: 'pause_after_30_minutes',
    });
  });
  it('requires an explicit occurrence for the duplicated autumn hour and resets it after a wall-time change', () => {
    const f = setup();
    f.component.form.patchValue({ date: '2026-10-25', time: '02:30', timeZone: 'Europe/Berlin' });
    f.component.submit();
    expect(f.selected).not.toHaveBeenCalled();
    expect(f.component.error()).toMatch(/zweimal/);
    f.component.form.controls.occurrence.setValue('later');
    f.component.submit();
    expect(f.selected).toHaveBeenLastCalledWith(
      expect.objectContaining({ scheduledAt: '2026-10-25T01:30:00.000Z' }),
    );
    f.selected.mockClear();
    f.component.form.controls.time.setValue('02:45');
    f.component.submit();
    expect(f.selected).not.toHaveBeenCalled();
  });
  it('rejects spring gaps, invalid zones and past times without an intent', () => {
    const f = setup();
    for (const value of [
      { date: '2027-03-28', time: '02:30', timeZone: 'Europe/Berlin' },
      { date: '2026-10-11', time: '18:30', timeZone: 'Unknown/Zone' },
      { date: '2026-10-10', time: '10:30', timeZone: 'Europe/Berlin' },
    ]) {
      f.component.form.patchValue(value);
      f.component.submit();
      expect(f.selected).not.toHaveBeenCalled();
      expect(f.component.error()).toBeTruthy();
    }
  });
  it('rechecks the clock at confirmation and preserves the delayed-publication choice', () => {
    const f = setup();
    f.component.form.patchValue({
      date: '2026-10-11',
      time: '18:30',
      timeZone: 'Europe/Berlin',
      latePolicy: 'publish_when_available',
    });
    f.component.submit();
    expect(f.selected).toHaveBeenLastCalledWith(
      expect.objectContaining({ latePolicy: 'publish_when_available' }),
    );
    f.selected.mockClear();
    f.fixture.componentRef.setInput('now', () => Date.parse('2026-10-12T00:00:00Z'));
    f.fixture.detectChanges();
    f.component.submit();
    expect(f.selected).not.toHaveBeenCalled();
  });
  it('formats quick times in the selected zone instead of the device zone', () => {
    const f = setup();
    f.component.form.controls.timeZone.setValue('Asia/Tokyo');
    f.component.quickTime(60);
    expect(f.component.form.controls.date.value).toBe('2026-10-10');
    expect(f.component.form.controls.time.value).toBe('22:00');
  });
  it('keeps closing and submitting blocked while the parent is saving', () => {
    const f = setup(),
      closed = vi.fn();
    f.component.closed.subscribe(closed);
    f.fixture.componentRef.setInput('busy', true);
    f.fixture.detectChanges();
    f.component.form.patchValue({ date: '2026-10-11', time: '18:30', timeZone: 'Europe/Berlin' });
    f.component.submit();
    f.component.close();
    expect(f.selected).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
  });
});
