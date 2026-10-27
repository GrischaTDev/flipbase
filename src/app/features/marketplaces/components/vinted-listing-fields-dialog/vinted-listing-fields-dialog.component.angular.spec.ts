import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { listingCategoryFixture } from '../../../../../../e2e/support/vinted-listing-category-fixture';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { CustomSelectComponent } from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { emptyVintedListingContent } from '../../models/vinted-listing-content';
import { VintedListingCategoryService } from '../../services/vinted-listing-category.service';
import { VintedListingFieldsDialogComponent } from './vinted-listing-fields-dialog.component';
import { AttributePickerComponent } from '../../../../shared/components/attribute-picker/attribute-picker.component';
import { flipbaseVintedListingFields } from '../../models/flipbase-vinted-listing-form';

let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: AttributePickerComponent,
      path: 'src/app/shared/components/attribute-picker/attribute-picker.component.ts',
    },
    {
      type: VintedListingFieldsDialogComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-fields-dialog/vinted-listing-fields-dialog.component.ts',
    },
    {
      type: ModalShellComponent,
      path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
    },
    { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
    { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
    {
      type: NoticeBannerComponent,
      path: 'src/app/shared/components/notice-banner/notice-banner.component.ts',
    },
    {
      type: CustomCheckboxComponent,
      path: 'src/app/shared/components/custom-checkbox/custom-checkbox.component.ts',
    },
    {
      type: CustomSelectComponent,
      path: 'src/app/shared/components/custom-select/custom-select.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
function setup() {
  const read = vi.fn().mockResolvedValue(listingCategoryFixture());
  TestBed.configureTestingModule({
    imports: [VintedListingFieldsDialogComponent],
    providers: [{ provide: VintedListingCategoryService, useValue: { read } }],
  });
  const fixture = TestBed.createComponent(VintedListingFieldsDialogComponent);
  fixture.componentRef.setInput('scopeKey', 'user-a/workspace-a/draft-a/account-a/1223');
  fixture.componentRef.setInput('connectionId', 'account-a');
  fixture.componentRef.setInput('categoryId', 1223);
  fixture.componentRef.setInput('content', {
    ...emptyVintedListingContent(),
    categoryId: 1223,
    categoryLabel: 'Bomberjacken',
    sizeLabel: 'M',
    conditionLabel: 'Sehr gut',
  });
  const selected = vi.fn(),
    closed = vi.fn(),
    schemaLoaded = vi.fn();
  fixture.componentInstance.selected.subscribe(selected);
  fixture.componentInstance.closed.subscribe(closed);
  fixture.componentInstance.schemaLoaded.subscribe(schemaLoaded);
  return { fixture, component: fixture.componentInstance, read, selected, closed, schemaLoaded };
}
async function settle(f: ReturnType<typeof setup>) {
  f.fixture.detectChanges();
  for (let index = 0; index < 12; index++) await Promise.resolve();
  f.fixture.detectChanges();
}
describe('Vinted category field dialog', () => {
  it('zeigt eigene Schuhgrößen unmittelbar und benötigt dafür weder Konto noch Anbieterabruf', async () => {
    const f = setup();
    f.read.mockRejectedValue(new Error('Vinted nicht erreichbar'));
    f.fixture.componentRef.setInput('inline', true);
    f.fixture.componentRef.setInput('connectionId', '');
    f.fixture.componentRef.setInput('categoryId', 16);
    f.fixture.componentRef.setInput(
      'fieldSchema',
      flipbaseVintedListingFields(16, 'Damen > Schuhe'),
    );
    f.fixture.componentRef.setInput('content', { ...emptyVintedListingContent(), categoryId: 16 });
    await settle(f);
    expect(f.read).not.toHaveBeenCalled();
    expect(f.component.loading()).toBe(false);
    expect(f.component.singleOptions('size')).toContainEqual(
      expect.objectContaining({ label: '38' }),
    );
    expect(f.component.singleOptions('size')).not.toContainEqual(
      expect.objectContaining({ label: 'M' }),
    );
    expect(f.fixture.nativeElement.textContent).toContain('Zustand');
    expect(f.fixture.nativeElement.textContent).toContain('Paketgröße');
    expect(f.component.error()).toBeNull();
  });
  it('sperrt direkte Farben und Materialien beim Speichern und gibt sie danach wieder frei', async () => {
    const f = setup();
    f.fixture.componentRef.setInput('inline', true);
    await settle(f);
    f.fixture.componentRef.setInput('disabled', true);
    await settle(f);
    expect(f.component.colorLabels.disabled).toBe(true);
    expect(f.component.materialLabels.disabled).toBe(true);
    f.fixture.componentRef.setInput('disabled', false);
    await settle(f);
    expect(f.component.colorLabels.enabled).toBe(true);
    expect(f.component.materialLabels.enabled).toBe(true);
    expect(f.selected).not.toHaveBeenCalled();
  });
  it('zeigt nicht mehr angebotene Entwurfswerte direkt an und erfindet dafür keine Kennungen', async () => {
    const f = setup();
    f.fixture.componentRef.setInput('inline', true);
    f.fixture.componentRef.setInput('content', {
      ...emptyVintedListingContent(),
      categoryId: 1223,
      sizeLabel: 'Alte Sondergröße',
      colorLabels: ['Alte Sonderfarbe'],
    });
    await settle(f);
    expect(f.fixture.nativeElement.textContent).toContain('Bisher: Alte Sondergröße');
    expect(f.fixture.nativeElement.textContent).toContain('Bisher: Alte Sonderfarbe');
    expect(f.component.form.controls.sizeId.value).toBeNull();
    expect(f.component.colorIds()).toEqual([]);
    expect(f.selected).not.toHaveBeenCalled();
  });
  it('übernimmt im direkten Feld nur die geänderte Angabe und öffnet keinen Dialog', async () => {
    const f = setup();
    f.fixture.componentRef.setInput('inline', true);
    f.fixture.componentRef.setInput('section', 'details');
    await settle(f);
    f.component.form.controls.sizeId.setValue(208);
    expect(f.selected).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fields: ['size'],
        values: expect.objectContaining({ sizeId: 208 }),
      }),
    );
    expect(f.fixture.nativeElement.querySelector('dialog')).toBeNull();
  });
  it('loads the explicit target once and applies real choices only on confirmation', async () => {
    const f = setup();
    await settle(f);
    expect(f.read).toHaveBeenCalledWith('account-a', 1223);
    expect(f.schemaLoaded).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 1223,
        titleMaxLength: 100,
        descriptionMaxLength: 2000,
      }),
    );
    expect(f.component.form.controls.sizeId.value).toBe(208);
    expect(f.component.form.controls.conditionId.value).toBe(2);
    expect(f.selected).not.toHaveBeenCalled();
    expect(f.component.singleOptions('size')).not.toContainEqual(
      expect.objectContaining({ value: 209 }),
    );
    f.component.toggle('color', 2, true);
    f.component.toggle('color', 1, true);
    f.component.toggle('material', 44, true);
    f.component.form.controls.packageSizeId.setValue(2);
    f.fixture.componentRef.setInput('content', {
      ...emptyVintedListingContent(),
      categoryId: 1223,
      title: 'Autosave',
    });
    await settle(f);
    expect(f.read).toHaveBeenCalledTimes(1);
    f.component.apply();
    expect(f.selected).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 1223,
        values: expect.objectContaining({
          sizeId: 208,
          sizeLabel: 'M',
          colorIds: [2, 1],
          colorLabels: ['Blau', 'Schwarz'],
          materialIds: [44],
          packageSizeId: 2,
        }),
        packageLabel: 'Mittel',
      }),
    );
    expect((f.fixture.nativeElement as HTMLElement).textContent).toContain('Vinted-Angaben wählen');
  });
  it('rejects a third color, unavailable IDs, disabled choices and stale category answers', async () => {
    const f = setup();
    await settle(f);
    f.component.toggle('color', 1, true);
    f.component.toggle('color', 2, true);
    f.component.toggle('color', 3, true);
    f.component.toggle('material', 999, true);
    expect(f.component.colorIds()).toEqual([1, 2]);
    expect(f.component.materialIds()).toEqual([]);
    f.component.form.controls.sizeId.setValue(209);
    f.component.apply();
    expect(f.selected).not.toHaveBeenCalled();
    expect(f.component.error()).toBeTruthy();
    f.read.mockResolvedValueOnce(listingCategoryFixture(2738));
    await f.component.load();
    expect(f.component.schema()).toBeNull();
    expect(f.component.error()).toBeTruthy();
  });
  it.each(['scope', 'close', 'destroy'])('ignores late answers after %s', async (action) => {
    const f = setup();
    let resolve!: (value: ReturnType<typeof listingCategoryFixture>) => void;
    f.read.mockImplementationOnce(
      () =>
        new Promise((value) => {
          resolve = value;
        }),
    );
    f.fixture.detectChanges();
    if (action === 'scope') f.fixture.componentRef.setInput('scopeKey', 'other-scope');
    if (action === 'close') f.component.close();
    if (action === 'destroy') f.fixture.destroy();
    resolve(listingCategoryFixture());
    for (let index = 0; index < 12; index++) await Promise.resolve();
    expect(f.component.schema()).toBeNull();
    expect(f.schemaLoaded).not.toHaveBeenCalled();
    f.component.apply();
    expect(f.selected).not.toHaveBeenCalled();
    if (action === 'scope') {
      await settle(f);
      expect(f.read).toHaveBeenCalledTimes(2);
      expect(f.component.schema()?.categoryId).toBe(1223);
    }
    f.fixture.destroy();
  });
  it('keeps unmatched free text visible and refuses to guess ambiguous labels', async () => {
    const f = setup();
    const schema = listingCategoryFixture();
    f.read.mockResolvedValueOnce({
      ...schema,
      fields: schema.fields.map((field) =>
        field.field === 'size'
          ? { ...field, choices: [{ ...field.choices[0] }, { ...field.choices[0], id: 210 }] }
          : field,
      ),
    });
    f.fixture.componentRef.setInput('content', {
      ...emptyVintedListingContent(),
      categoryId: 1223,
      sizeLabel: 'M',
      conditionLabel: 'Neuwertig',
    });
    await settle(f);
    expect(f.component.form.controls.sizeId.value).toBeNull();
    expect((f.fixture.nativeElement as HTMLElement).textContent).toContain('Neuwertig');
    f.component.apply();
    expect(f.selected).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ sizeId: null, conditionId: null }),
      }),
    );
  });
  it('allows a failed read to be retried and disables applying while busy', async () => {
    const f = setup();
    f.read.mockRejectedValueOnce(new Error('Verbindung verloren'));
    await settle(f);
    expect(f.component.error()).toContain('Verbindung verloren');
    await f.component.load();
    f.fixture.componentRef.setInput('disabled', true);
    f.component.apply();
    expect(f.selected).not.toHaveBeenCalled();
    f.fixture.componentRef.setInput('disabled', false);
    f.component.apply();
    expect(f.selected).toHaveBeenCalledTimes(1);
  });
});
