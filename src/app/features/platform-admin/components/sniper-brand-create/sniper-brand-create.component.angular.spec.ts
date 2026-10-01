import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SniperBrandCreateComponent } from './sniper-brand-create.component';
import { VintedBrandSearchService } from '../../services/vinted-brand-search.service';
import { QueryDraft } from '../../models/sniper-query.model';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { SearchMultiSelectComponent } from '../../../../shared/components/search-multi-select/search-multi-select.component';
import { CustomSearchInputComponent } from '../../../../shared/components/custom-search-input/custom-search-input.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}

const snapshots = new Map<unknown, AngularInputMetadata>();
function registerSignalInputs(
  component: unknown,
  names: readonly string[],
  outputNames: readonly string[] = [],
): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  snapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
    outputs: metadata.outputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(names.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(names.map((name) => [name, name])),
  };
  metadata.outputs = {
    ...metadata.outputs,
    ...Object.fromEntries(outputNames.map((name) => [name, name])),
  };
}

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//u, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource ${url} ist nicht eindeutig.`);
    return readFile(matches[0], 'utf8');
  });
  registerSignalInputs(SniperBrandCreateComponent, ['existingBrandIds', 'saving', 'saveError']);
  registerSignalInputs(NumberInputComponent, ['min', 'max', 'ariaLabel']);
  registerSignalInputs(TextFieldComponent, [
    'id',
    'label',
    'placeholder',
    'multiline',
    'type',
    'maxLength',
    'helpText',
  ]);
  registerSignalInputs(ButtonComponent, ['disabled', 'loading'], ['clicked']);
  registerSignalInputs(
    CustomSearchInputComponent,
    [
      'inputRole',
      'expanded',
      'controlsId',
      'activeDescendantId',
      'maxLength',
      'clearOnEscape',
      'ariaLabel',
      'placeholder',
      'value',
      'size',
    ],
    ['valueChange'],
  );
  (CustomSearchInputComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp.outputs[
    'valueChange'
  ] = 'value';
  registerSignalInputs(
    SearchMultiSelectComponent,
    [
      'controlId',
      'label',
      'placeholder',
      'searchPlaceholder',
      'helpText',
      'emptyText',
      'singularLabel',
      'pluralLabel',
      'options',
      'selectedCount',
      'loading',
      'error',
      'disabled',
    ],
    ['opened', 'searchTermChange', 'optionSelected', 'retry'],
  );
});

afterAll(() => {
  for (const [component, snapshot] of snapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
    metadata.outputs = snapshot.outputs;
  }
});

describe('SniperBrandCreateComponent', () => {
  let fixture: ComponentFixture<SniperBrandCreateComponent>;
  const search = vi.fn(async () => [
    { id: 53, name: 'Nike' },
    { id: 88, name: 'Ralph Lauren' },
    { id: 4273, name: 'Polo Ralph Lauren' },
  ]);

  async function build(existingBrandIds: number[] = []) {
    TestBed.configureTestingModule({
      imports: [SniperBrandCreateComponent],
      providers: [{ provide: VintedBrandSearchService, useValue: { search } }],
    });
    fixture = TestBed.createComponent(SniperBrandCreateComponent);
    fixture.componentRef.setInput('existingBrandIds', existingBrandIds);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    search.mockClear();
    vi.useRealTimers();
  });

  it('creates one paused filter draft per selected brand and hides existing brands', async () => {
    const component = await build([53]);
    const emitted: QueryDraft[][] = [];
    component.saved.subscribe((drafts) => emitted.push(drafts));
    const host = fixture.nativeElement as HTMLElement;
    expect(search).not.toHaveBeenCalled();
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    host.querySelector<HTMLButtonElement>('#vinted-brand-picker')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(search).toHaveBeenCalledWith('');
    expect(component.results()).toHaveLength(3);
    expect(host.querySelector('#vinted-brand-picker')?.getAttribute('aria-expanded')).toBe('true');
    expect(
      [...host.querySelectorAll('[role="option"]')].map((option) => option.textContent?.trim()),
    ).toEqual(['Ralph Lauren', 'Polo Ralph Lauren']);
    host.querySelector<HTMLButtonElement>('[role="option"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('[role="option"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('#vinted-brand-picker')?.textContent).toContain(
      '2 Marken ausgewählt',
    );
    host
      .querySelector<HTMLInputElement>('[role="combobox"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('#vinted-brand-picker')?.getAttribute('aria-expanded')).toBe('false');
    component.form.controls.intervalSeconds.setValue(30);
    component.submit();
    expect(emitted).toEqual([
      [
        { id: null, title: 'Ralph Lauren', brandId: 88, intervalSeconds: 30, notes: '' },
        { id: null, title: 'Polo Ralph Lauren', brandId: 4273, intervalSeconds: 30, notes: '' },
      ],
    ]);
    component.removeSaved([88]);
    expect(component.selected().map((brand) => brand.id)).toEqual([4273]);
  });

  it('lets the user search for rare brands and ignores outdated responses', async () => {
    const component = await build();
    let completeFirst: ((brands: { id: number; name: string }[]) => void) | undefined;
    search.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeFirst = resolve;
        }),
    );
    const first = component.searchBrands('rare');
    const second = component.searchBrands('rarer');
    await second;
    completeFirst?.([{ id: 999, name: 'Veraltete Marke' }]);
    await first;
    expect(component.results().map((brand) => brand.name)).not.toContain('Veraltete Marke');
    expect(search).toHaveBeenCalledWith('rarer');
  });

  it('searches from the input after typing and does not call Vinted for one character', async () => {
    await build();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('#vinted-brand-picker')!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    search.mockClear();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[role="combobox"]',
    )!;
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    input.value = 'R';
    input.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.results()).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(search).not.toHaveBeenCalled();
    input.value = 'Rare';
    input.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.keyword()).toBe('Rare');
    expect(fixture.componentInstance.loading()).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    expect(search).toHaveBeenCalledWith('Rare');
  });

  it('has no accessibility violations in the brand selection form', async () => {
    await build();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('#vinted-brand-picker')!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    const results = await axe.run(fixture.nativeElement as HTMLElement);
    expect(results.violations).toEqual([]);
  });

  it('closes the picker on Escape without closing its parent dialog or clearing the search', async () => {
    const component = await build();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('#vinted-brand-picker')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const input = host.querySelector<HTMLInputElement>('[role="combobox"]')!;
    expect(input.type).toBe('text');
    input.value = 'Patagonia';
    input.dispatchEvent(new Event('input'));
    const parentEscape = vi.fn();
    document.addEventListener('keydown', parentEscape);
    try {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(host.querySelector('[role="listbox"]')).toBeNull();
      expect(parentEscape).not.toHaveBeenCalled();
      expect(component.keyword()).toBe('Patagonia');
    } finally {
      document.removeEventListener('keydown', parentEscape);
    }
  });

  it('closes the picker on an outside pointer press and offers an explicit close action', async () => {
    await build();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('#vinted-brand-picker')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.textContent).toContain('Auswahl schließen');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[role="listbox"]')).toBeNull();
  });

  it('selects the highlighted result with Enter without restarting the search', async () => {
    const component = await build();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('#vinted-brand-picker')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const input = host.querySelector<HTMLInputElement>('[role="combobox"]')!;
    search.mockClear();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(component.selected()).toEqual([{ id: 53, name: 'Nike' }]);
    expect(search).not.toHaveBeenCalled();
    expect(component.loading()).toBe(false);
  });

  it('contains Escape from the picker footer before it reaches the parent dialog', async () => {
    await build();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('#vinted-brand-picker')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const parentEscape = vi.fn();
    document.addEventListener('keydown', parentEscape);
    try {
      const close = Array.from(host.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Auswahl schließen'),
      )!;
      close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(host.querySelector('[role="listbox"]')).toBeNull();
      expect(parentEscape).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', parentEscape);
    }
  });
});
