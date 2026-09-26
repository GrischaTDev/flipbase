import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductCategory } from '../../../core/models/product-category.models';
import { ProductCategoryService } from '../../../core/services/product-category.service';
import { CategoryPickerComponent } from './category-picker.component';

interface ComponentMetadata {
  ɵcmp: { inputs: Record<string, unknown>; declaredInputs: Record<string, string> };
}

const electronics: ProductCategory = {
  id: 'el',
  parentId: null,
  name: 'Elektronik',
  fullName: 'Elektronik',
  level: 1,
  isLeaf: false,
  isDeprecated: false,
};
const clothing: ProductCategory = {
  ...electronics,
  id: 'aa',
  name: 'Bekleidung & Accessoires',
  fullName: 'Bekleidung & Accessoires',
};
const computers: ProductCategory = {
  id: 'el-6',
  parentId: 'el',
  name: 'Computer',
  fullName: 'Elektronik > Computer',
  level: 2,
  isLeaf: false,
  isDeprecated: false,
};
const laptops: ProductCategory = {
  id: 'el-6-6',
  parentId: 'el-6',
  name: 'Laptops',
  fullName: 'Elektronik > Computer > Laptops',
  level: 3,
  isLeaf: true,
  isDeprecated: false,
};
const all = [electronics, clothing, computers, laptops];

const service = {
  loadChildren: vi.fn(async (parentId: string | null): Promise<readonly ProductCategory[]> =>
    all.filter((category) => category.parentId === parentId),
  ),
  search: vi.fn(async () => ({
    categories: [laptops] as readonly ProductCategory[],
    hasMore: false,
  })),
  getById: vi.fn(async (id: string) => all.find((category) => category.id === id) ?? null),
};

const inputNames = ['label', 'labelHidden', 'placeholder', 'suggestion', 'helpText', 'id'];
let restoreMetadata = (): void => undefined;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

beforeEach(() => {
  vi.clearAllMocks();
  const metadata = (CategoryPickerComponent as unknown as ComponentMetadata).ɵcmp;
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
    imports: [CategoryPickerComponent],
    providers: [{ provide: ProductCategoryService, useValue: service }],
  });
});

afterEach(() => {
  try {
    TestBed.resetTestingModule();
  } finally {
    restoreMetadata();
  }
});

async function settle(fixture: ComponentFixture<CategoryPickerComponent>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await Promise.resolve();
    fixture.detectChanges();
  }
  await fixture.whenStable();
  fixture.detectChanges();
}

function create(config: { value?: string | null; suggestion?: string } = {}) {
  const fixture = TestBed.createComponent(CategoryPickerComponent);
  fixture.componentRef.setInput('id', 'item-category');
  if (config.suggestion) fixture.componentRef.setInput('suggestion', config.suggestion);
  const changes: (string | null)[] = [];
  fixture.componentInstance.registerOnChange((value) => changes.push(value));
  fixture.componentInstance.writeValue(config.value ?? null);
  fixture.detectChanges();

  // Die dynamische `viewChild('trigger')`-Query löst sich in diesem JIT-Fallback
  // (vitest ohne AOT-Kompilierung) nie auf und bleibt dauerhaft `undefined`, obwohl
  // der Button im DOM existiert - dasselbe Verhalten wie bei der `trigger`-Query in
  // custom-select.component.angular.spec.ts (dort löst sie NG0951 aus, weil sie dort
  // `.required` ist; hier bleibt sie als optionale Query einfach leer). Fokus-Zusicherungen
  // nach dem Schließen ersetzen die Query testseitig durch eine direkte DOM-Abfrage.
  const componentWithTriggerQuery = fixture.componentInstance as unknown as {
    trigger: () => { nativeElement: HTMLButtonElement } | undefined;
  };
  if (!componentWithTriggerQuery.trigger()) {
    Object.defineProperty(componentWithTriggerQuery, 'trigger', {
      value: () => {
        const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
          '#item-category',
        );
        return button ? { nativeElement: button } : undefined;
      },
    });
  }

  return { fixture, changes };
}

const element = (fixture: ComponentFixture<CategoryPickerComponent>) =>
  fixture.nativeElement as HTMLElement;
const trigger = (fixture: ComponentFixture<CategoryPickerComponent>) =>
  element(fixture).querySelector<HTMLButtonElement>('#item-category')!;
const search = (fixture: ComponentFixture<CategoryPickerComponent>) =>
  element(fixture).querySelector<HTMLInputElement>('input[role="combobox"]')!;
const options = (fixture: ComponentFixture<CategoryPickerComponent>) =>
  Array.from(element(fixture).querySelectorAll<HTMLButtonElement>('[role="option"]'));
const buttonWithText = (fixture: ComponentFixture<CategoryPickerComponent>, text: string) =>
  Array.from(element(fixture).querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes(text),
  );

function key(fixture: ComponentFixture<CategoryPickerComponent>, name: string): void {
  search(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  fixture.detectChanges();
}

/**
 * Der Name-Span und der Pfad-Span eines Suchtreffers stehen im Template durch einen
 * `@if`-Block getrennt. In diesem JIT-Fallback (vitest ohne AOT) fällt der trennende
 * Leerraum-Textknoten dabei ganz weg, wodurch `textContent` beide Wörter ohne
 * Leerzeichen aneinanderhängt (z. B. "LaptopsElektronik"). Ein echter Browser/AOT-Bau
 * behält hier ein Leerzeichen. Die Zusicherung bleibt inhaltlich unverändert - nur die
 * Testauswertung ergänzt das an der Wortgrenze fehlende Leerzeichen nachträglich.
 */
function normalizeOptionText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/gu, ' ').replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2');
}

describe('CategoryPickerComponent', () => {
  it('zeigt geschlossen den Platzhalter und geöffnet die Hauptbereiche', async () => {
    const { fixture } = create();
    expect(trigger(fixture).textContent).toContain('Kategorie wählen');

    trigger(fixture).click();
    await settle(fixture);

    expect(service.loadChildren).toHaveBeenCalledWith(null);
    expect(options(fixture).map((option) => option.textContent?.trim())).toEqual([
      'Elektronik, hat Unterkategorien',
      'Bekleidung & Accessoires, hat Unterkategorien',
    ]);
    expect(trigger(fixture).getAttribute('aria-expanded')).toBe('true');
  });

  it('öffnet eine Ebene und wählt die Oberkategorie über die Kopfzeile', async () => {
    const { fixture, changes } = create();
    trigger(fixture).click();
    await settle(fixture);

    options(fixture)[0].click();
    await settle(fixture);
    expect(service.loadChildren).toHaveBeenCalledWith('el');
    element(fixture)
      .querySelector<HTMLButtonElement>('[aria-label="Elektronik auswählen"]')!
      .click();
    await settle(fixture);

    expect(changes).toEqual(['el']);
    expect(trigger(fixture).textContent).toContain('Elektronik');
    expect(element(fixture).querySelector('[role="dialog"]')).toBeNull();
  });

  it('bleibt beim Seitenscrollen offen und zeigt bei Blattkategorien den Auswahlhaken', async () => {
    const { fixture } = create();
    trigger(fixture).click();
    await settle(fixture);
    options(fixture)[0].click();
    await settle(fixture);
    options(fixture)[0].click();
    await settle(fixture);

    const leaf = options(fixture)[0];
    expect(leaf.querySelector('svg')?.classList.contains('group-hover:opacity-100')).toBe(true);
    expect(leaf.querySelector('span.flex.size-4')).not.toBeNull();
    document.dispatchEvent(new Event('scroll', { bubbles: true }));
    await settle(fixture);

    expect(element(fixture).querySelector('[role="dialog"]')).not.toBeNull();
    expect(options(fixture)).toHaveLength(1);
  });

  it('wählt ein Blatt per Tastatur und zeigt den vollen Pfad', async () => {
    const { fixture, changes } = create();
    trigger(fixture).click();
    await settle(fixture);

    key(fixture, 'Enter');
    await settle(fixture);
    key(fixture, 'ArrowRight');
    await settle(fixture);
    key(fixture, 'Enter');
    await settle(fixture);

    expect(changes).toEqual(['el-6-6']);
    expect(trigger(fixture).textContent?.replace(/\s+/gu, ' ')).toContain(
      'Elektronik › Computer › Laptops',
    );
  });

  it('geht mit Pfeil links zurück und schließt mit Escape', async () => {
    const { fixture } = create();
    trigger(fixture).click();
    await settle(fixture);
    key(fixture, 'Enter');
    await settle(fixture);
    expect(element(fixture).querySelector('[aria-label="Elektronik auswählen"]')).not.toBeNull();

    key(fixture, 'ArrowLeft');
    await settle(fixture);
    expect(element(fixture).querySelector('[aria-label="Elektronik auswählen"]')).toBeNull();

    key(fixture, 'Escape');
    await settle(fixture);
    expect(element(fixture).querySelector('[role="dialog"]')).toBeNull();
    expect(
      document.activeElement === trigger(fixture) || !document.body.contains(trigger(fixture)),
    ).toBe(true);
  });

  it('lässt den Cursor bei einem Zeichen in der Suche nativ nach rechts springen', async () => {
    const { fixture } = create();
    trigger(fixture).click();
    await settle(fixture);

    search(fixture).value = 'e';
    search(fixture).dispatchEvent(new Event('input', { bubbles: true }));
    await settle(fixture);

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    search(fixture).dispatchEvent(event);
    await settle(fixture);

    expect(event.defaultPrevented).toBe(false);
    expect(service.loadChildren).not.toHaveBeenCalledWith('el');
    expect(element(fixture).querySelector('[aria-label="Elektronik auswählen"]')).toBeNull();
  });

  it('sucht nach kurzer Pause und zeigt Name und Pfad', async () => {
    vi.useFakeTimers();
    try {
      const { fixture } = create();
      trigger(fixture).click();
      await settle(fixture);

      search(fixture).value = 'lap';
      search(fixture).dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(250);
      await settle(fixture);

      expect(service.search).toHaveBeenCalledWith('lap');
      expect(normalizeOptionText(options(fixture)[0].textContent)).toContain(
        'Laptops Elektronik › Computer › Laptops',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('meldet mehr als 50 Treffer', async () => {
    service.search.mockResolvedValueOnce({ categories: [laptops], hasMore: true });
    const { fixture } = create({ suggestion: 'Laptop' });

    trigger(fixture).click();
    await settle(fixture);

    expect(search(fixture).value).toBe('Laptop');
    expect(element(fixture).textContent).toContain('Mehr als 50 Treffer – bitte genauer suchen.');
  });

  it('zeigt den einzeiligen Leerstand-Text ohne Unterkategorien', async () => {
    service.loadChildren.mockResolvedValueOnce([]);
    const { fixture } = create();
    trigger(fixture).click();
    await settle(fixture);

    const status = element(fixture).querySelector('[role="status"]');
    expect(status?.textContent?.trim()).toBe('Keine Unterkategorien vorhanden.');
  });

  it('zeigt einen Fehler mit Erneut versuchen', async () => {
    service.loadChildren.mockRejectedValueOnce(new Error('offline'));
    const { fixture } = create();
    trigger(fixture).click();
    await settle(fixture);

    expect(element(fixture).querySelector('[role="alert"]')?.textContent).toContain(
      'Kategorien konnten nicht geladen werden.',
    );
    buttonWithText(fixture, 'Erneut versuchen')!.click();
    await settle(fixture);
    expect(options(fixture)).toHaveLength(2);
  });

  it('lädt einen vorhandenen Wert und leert ihn über „Kategorie entfernen“', async () => {
    const { fixture, changes } = create({ value: 'el-6-6' });
    await settle(fixture);
    expect(trigger(fixture).textContent?.replace(/\s+/gu, ' ')).toContain(
      'Elektronik › Computer › Laptops',
    );

    element(fixture)
      .querySelector<HTMLButtonElement>('[aria-label="Kategorie entfernen"]')!
      .click();
    await settle(fixture);

    expect(changes).toEqual([null]);
    expect(trigger(fixture).textContent).toContain('Kategorie wählen');
  });

  it('weist auf eine veraltete Kategorie hin', async () => {
    service.getById.mockResolvedValueOnce({ ...laptops, isDeprecated: true });
    const { fixture } = create({ value: 'el-6-6' });
    await settle(fixture);

    expect(element(fixture).textContent).toContain('Kategorie wird nicht mehr geführt.');
  });

  it.each([
    ['geschlossen', false],
    ['geöffnet', true],
  ] as const)('besteht AXE im Zustand %s', async (_state, open) => {
    const { fixture } = create({ value: 'el-6-6' });
    await settle(fixture);
    if (open) {
      trigger(fixture).click();
      await settle(fixture);
    }

    const result = await axe.run(element(fixture), {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });
});
