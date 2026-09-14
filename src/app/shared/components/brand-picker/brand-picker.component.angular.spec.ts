import '@angular/compiler';
import { computed, signal, ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Brand, brandNameKey } from '../../../core/models/product-category.models';
import { BrandService } from '../../../core/services/brand.service';
import { BrandPickerComponent } from './brand-picker.component';

interface ComponentMetadata {
  ɵcmp: { inputs: Record<string, unknown>; declaredInputs: Record<string, string> };
}

function createBrandServiceStub(initial: Brand[]) {
  const brands = signal<readonly Brand[]>(initial);
  const stub = {
    brands: computed(() => brands()),
    loading: signal(false),
    loadError: signal<Error | null>(null),
    ensureLoaded: vi.fn(async () => undefined),
    reload: vi.fn(async () => undefined),
    search: (term: string) =>
      brands().filter((brand) => brandNameKey(brand.name).includes(brandNameKey(term))),
    findByName: (name: string) =>
      brands().find((brand) => brandNameKey(brand.name) === brandNameKey(name)) ?? null,
    findById: (id: string) => brands().find((brand) => brand.id === id) ?? null,
    create: vi.fn(async (name: string) => {
      const brand = { id: `new-${name}`, workspaceId: 'ws-1', name: name.trim() };
      brands.update((list) => [...list, brand]);
      return { data: brand as Brand | null, error: null as Error | null };
    }),
  };
  return stub;
}

const inputNames = ['label', 'labelHidden', 'placeholder', 'suggestion', 'helpText', 'id'];
let restoreMetadata = (): void => undefined;
let service: ReturnType<typeof createBrandServiceStub>;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

beforeEach(() => {
  service = createBrandServiceStub([
    { id: 'b1', workspaceId: 'ws-1', name: 'Bosch' },
    { id: 'b2', workspaceId: 'ws-1', name: 'Sony' },
  ]);
  const metadata = (BrandPickerComponent as unknown as ComponentMetadata).ɵcmp;
  const inputs = metadata.inputs;
  const declared = metadata.declaredInputs;
  metadata.inputs = { ...inputs };
  metadata.declaredInputs = { ...declared };
  for (const name of inputNames) {
    metadata.inputs[name] = [name, 1, null];
    metadata.declaredInputs[name] = name;
  }
  restoreMetadata = () => {
    metadata.inputs = inputs;
    metadata.declaredInputs = declared;
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BrandPickerComponent],
    providers: [{ provide: BrandService, useValue: service }],
  });
});

afterEach(() => {
  try {
    TestBed.resetTestingModule();
  } finally {
    restoreMetadata();
  }
});

async function settle(fixture: ComponentFixture<BrandPickerComponent>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
}

function create(config: { value?: string | null; suggestion?: string } = {}) {
  const fixture = TestBed.createComponent(BrandPickerComponent);
  fixture.componentRef.setInput('id', 'item-brand');
  if (config.suggestion) fixture.componentRef.setInput('suggestion', config.suggestion);
  const changes: (string | null)[] = [];
  fixture.componentInstance.registerOnChange((value) => changes.push(value));
  fixture.componentInstance.writeValue(config.value ?? null);
  fixture.detectChanges();
  return { fixture, changes };
}

const element = (fixture: ComponentFixture<BrandPickerComponent>) =>
  fixture.nativeElement as HTMLElement;
const field = (fixture: ComponentFixture<BrandPickerComponent>) =>
  element(fixture).querySelector<HTMLInputElement>('#item-brand')!;
const options = (fixture: ComponentFixture<BrandPickerComponent>) =>
  Array.from(element(fixture).querySelectorAll<HTMLButtonElement>('[role="option"]'));

function type(fixture: ComponentFixture<BrandPickerComponent>, text: string): void {
  field(fixture).value = text;
  field(fixture).dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function key(fixture: ComponentFixture<BrandPickerComponent>, name: string): void {
  field(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  fixture.detectChanges();
}

describe('BrandPickerComponent', () => {
  it('filtert beim Tippen und wählt per Tastatur', async () => {
    const { fixture, changes } = create();

    type(fixture, 'bos');
    await settle(fixture);
    expect(options(fixture).map((option) => option.textContent?.trim())).toEqual([
      'Bosch',
      '„bos“ als neue Marke anlegen',
    ]);

    key(fixture, 'Enter');
    await settle(fixture);

    expect(changes).toEqual(['b1']);
    expect(field(fixture).value).toBe('Bosch');
    expect(field(fixture).getAttribute('aria-expanded')).toBe('false');
  });

  it('bietet bei exakter Übereinstimmung kein Anlegen an', async () => {
    const { fixture } = create();

    type(fixture, 'SONY');
    await settle(fixture);

    expect(options(fixture).map((option) => option.textContent?.trim())).toEqual(['Sony']);
  });

  it('legt eine neue Marke an und wählt sie aus', async () => {
    const { fixture, changes } = create();

    type(fixture, 'Makita');
    await settle(fixture);
    options(fixture).at(-1)!.click();
    await settle(fixture);

    expect(service.create).toHaveBeenCalledWith('Makita');
    expect(changes).toEqual(['new-Makita']);
    expect(field(fixture).value).toBe('Makita');
  });

  it('zeigt einen Fehler beim Anlegen unter dem Feld und behält den Text', async () => {
    service.create.mockResolvedValueOnce({ data: null, error: new Error('Speichern gesperrt') });
    const { fixture, changes } = create();

    type(fixture, 'Makita');
    await settle(fixture);
    options(fixture).at(-1)!.click();
    await settle(fixture);

    expect(element(fixture).querySelector('[role="alert"]')?.textContent).toContain(
      'Speichern gesperrt',
    );
    expect(field(fixture).value).toBe('Makita');
    expect(changes).toEqual([]);
  });

  it('entfernt die Auswahl beim Weitertippen und weist auf nicht übernommenen Text hin', async () => {
    const { fixture, changes } = create({ value: 'b1' });
    await settle(fixture);
    expect(field(fixture).value).toBe('Bosch');

    type(fixture, 'Boschx');
    key(fixture, 'Escape');
    await settle(fixture);

    expect(changes).toEqual([null]);
    expect(element(fixture).textContent).toContain(
      'Noch nicht übernommen – Marke auswählen oder neu anlegen.',
    );
  });

  it('wählt einen passenden Vorschlag automatisch', async () => {
    const { fixture, changes } = create({ suggestion: 'sony' });
    await settle(fixture);

    expect(changes).toEqual(['b2']);
    expect(field(fixture).value).toBe('Sony');
  });

  it('übernimmt einen unbekannten Vorschlag nur als Text', async () => {
    const { fixture, changes } = create({ suggestion: 'Anker' });
    await settle(fixture);

    expect(changes).toEqual([]);
    expect(field(fixture).value).toBe('Anker');
  });

  it('leert die Auswahl über „Marke entfernen“', async () => {
    const { fixture, changes } = create({ value: 'b2' });
    await settle(fixture);

    element(fixture).querySelector<HTMLButtonElement>('[aria-label="Marke entfernen"]')!.click();
    await settle(fixture);

    expect(changes).toEqual([null]);
    expect(field(fixture).value).toBe('');
  });

  it('zeigt einen Ladefehler mit Erneut versuchen', async () => {
    service.loadError.set(new Error('offline'));
    const { fixture } = create();

    type(fixture, 'b');
    await settle(fixture);
    const retry = Array.from(element(fixture).querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Erneut versuchen'),
    );
    retry!.click();

    expect(service.reload).toHaveBeenCalled();
  });

  it.each([
    ['geschlossen', false],
    ['geöffnet', true],
  ] as const)('besteht AXE im Zustand %s', async (_state, open) => {
    const { fixture } = create({ value: 'b1' });
    await settle(fixture);
    if (open) {
      type(fixture, 'o');
      await settle(fixture);
    }

    const result = await axe.run(element(fixture), {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });
});
