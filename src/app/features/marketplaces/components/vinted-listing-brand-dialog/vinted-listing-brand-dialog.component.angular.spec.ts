import { TestBed } from '@angular/core/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { VintedBrandSearchService } from '../../../platform-admin/services/vinted-brand-search.service';
import type { VintedBrand } from '../../../platform-admin/models/vinted-brand.model';
import { VintedListingBrandDialogComponent } from './vinted-listing-brand-dialog.component';

let restore: (() => void) | undefined;
beforeAll(async () => {
  restore = await prepareMarketplaceRendering([
    {
      type: VintedListingBrandDialogComponent,
      path: 'src/app/features/marketplaces/components/vinted-listing-brand-dialog/vinted-listing-brand-dialog.component.ts',
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
      type: TextFieldComponent,
      path: 'src/app/shared/components/text-field/text-field.component.ts',
    },
  ]);
});
afterAll(() => restore?.());
afterEach(() => TestBed.resetTestingModule());
const brands = [
  { id: 317425, name: 'Jako-o' },
  { id: 254956, name: 'Jako' },
];
function setup() {
  const search = vi.fn().mockResolvedValue(brands);
  TestBed.configureTestingModule({
    imports: [VintedListingBrandDialogComponent],
    providers: [{ provide: VintedBrandSearchService, useValue: { search } }],
  });
  const fixture = TestBed.createComponent(VintedListingBrandDialogComponent);
  fixture.componentRef.setInput('scopeKey', 'user-a/workspace-a/draft-a');
  fixture.componentRef.setInput('workspaceId', 'workspace-a');
  fixture.componentRef.setInput('initialLabel', 'Jako');
  fixture.detectChanges();
  const selected = vi.fn(),
    closed = vi.fn();
  fixture.componentInstance.selected.subscribe(selected);
  fixture.componentInstance.closed.subscribe(closed);
  return { fixture, component: fixture.componentInstance, search, selected, closed };
}
describe('Vinted listing brand dialog', () => {
  it('renders real choices and emits the chosen ID and canonical name together', async () => {
    const f = setup();
    await f.component.search();
    f.fixture.detectChanges();
    expect(f.search).toHaveBeenCalledWith('Jako', 'workspace-a');
    const element = f.fixture.nativeElement as HTMLElement;
    const buttons = [...element.querySelectorAll('button')];
    buttons.find((button) => button.textContent?.trim() === 'Jako')!.click();
    expect(f.selected).toHaveBeenCalledWith({ brandId: 254956, brandLabel: 'Jako' });
    f.component.choose({ id: 254956, name: 'Jako-o' });
    expect(f.selected).toHaveBeenCalledTimes(1);
  });
  it('requires a search term and offers explicit no-brand selection', async () => {
    const f = setup();
    f.component.query.setValue('  ');
    await f.component.search();
    expect(f.search).not.toHaveBeenCalled();
    expect(f.component.error()).toMatch(/Markennamen/);
    f.component.chooseNoBrand();
    expect(f.selected).toHaveBeenCalledWith({ brandId: null, brandLabel: 'Keine Marke' });
  });
  it('discards a late result after editing the query while another search completes', async () => {
    const f = setup();
    let resolve!: (brands: VintedBrand[]) => void;
    f.search.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = f.component.search();
    f.component.query.setValue('Nike');
    await f.component.search();
    resolve([{ id: 999, name: 'Alte Marke' }]);
    await pending;
    expect(f.component.results()).toEqual(brands);
    expect(f.component.loading()).toBe(false);
  });
  it('rejects old choices and late responses immediately after changing the workspace', async () => {
    const f = setup();
    await f.component.search();
    f.fixture.componentRef.setInput('workspaceId', 'workspace-b');
    f.component.choose(brands[1]);
    expect(f.selected).not.toHaveBeenCalled();
    f.fixture.detectChanges();
    let resolve!: (brands: VintedBrand[]) => void;
    f.search.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = f.component.search();
    f.fixture.componentRef.setInput('scopeKey', 'user-b/workspace-b/draft-b');
    resolve(brands);
    await pending;
    f.fixture.detectChanges();
    expect(f.component.results()).toEqual([]);
  });
  it('cannot select while busy or disabled, or after closing a pending search', async () => {
    const f = setup();
    let resolve!: (brands: VintedBrand[]) => void;
    f.search.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = f.component.search();
    f.component.chooseNoBrand();
    expect(f.selected).not.toHaveBeenCalled();
    f.component.close();
    resolve(brands);
    await pending;
    f.component.chooseNoBrand();
    expect(f.component.results()).toEqual([]);
    expect(f.selected).not.toHaveBeenCalled();
    expect(f.closed).toHaveBeenCalledOnce();
  });
  it('shows retryable errors and rejects conflicting names for the same brand ID', async () => {
    const f = setup();
    f.search.mockRejectedValueOnce(new Error('Verbindung verloren'));
    await f.component.search();
    expect(f.component.error()).toBe('Verbindung verloren');
    expect(f.component.loading()).toBe(false);
    f.search.mockResolvedValueOnce([
      { id: 254956, name: 'Jako' },
      { id: 254956, name: 'Jako-o' },
    ]);
    await f.component.search();
    expect(f.component.results()).toEqual([]);
    expect(f.component.error()).toMatch(/widersprüchliche/);
    await f.component.search();
    f.fixture.componentRef.setInput('disabled', true);
    f.component.choose(brands[1]);
    expect(f.selected).not.toHaveBeenCalled();
  });
});
