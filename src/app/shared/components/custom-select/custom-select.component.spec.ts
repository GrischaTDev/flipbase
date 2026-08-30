import '@angular/compiler';
import { ElementRef, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import axe from 'axe-core';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomSelectComponent, SelectOption } from './custom-select.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

const options: readonly SelectOption<string>[] = [
  { value: 'all', label: 'Alle Plattformen' },
  { value: 'ebay', label: 'eBay' },
  { value: 'vinted', label: 'Vinted' },
];

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

beforeEach(() => {
  const metadata = (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
  inputMetadataSnapshot = {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
  };
  metadata.inputs = {
    ...metadata.inputs,
    options: ['options', 1, null],
    value: ['value', 1, null],
    placeholder: ['placeholder', 1, null],
    variant: ['variant', 1, null],
    size: ['size', 1, null],
    disabled: ['disabled', 1, null],
    widthClass: ['widthClass', 1, null],
    openDirection: ['openDirection', 1, null],
    ariaLabel: ['ariaLabel', 1, null],
    triggerId: ['triggerId', 1, null],
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    options: 'options',
    value: 'value',
    placeholder: 'placeholder',
    variant: 'variant',
    size: 'size',
    disabled: 'disabled',
    widthClass: 'widthClass',
    openDirection: 'openDirection',
    ariaLabel: 'ariaLabel',
    triggerId: 'triggerId',
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [CustomSelectComponent] });
});

afterEach(() => {
  try {
    TestBed.resetTestingModule();
  } finally {
    if (inputMetadataSnapshot) {
      const metadata = (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
      metadata.inputs = inputMetadataSnapshot.inputs;
      metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
      inputMetadataSnapshot = null;
    }
  }
});

function createSelect(
  config: {
    value?: string | null;
    variant?: 'default' | 'pill' | 'filter';
    disabled?: boolean;
    triggerId?: string;
    options?: readonly SelectOption<string>[];
  } = {},
) {
  const fixture = TestBed.createComponent(CustomSelectComponent<string>);
  fixture.componentRef.setInput('options', config.options ?? options);
  fixture.componentRef.setInput('ariaLabel', 'Plattform filtern');
  if (config.variant) fixture.componentRef.setInput('variant', config.variant);
  if (config.disabled !== undefined) fixture.componentRef.setInput('disabled', config.disabled);
  if (config.triggerId) fixture.componentRef.setInput('triggerId', config.triggerId);
  fixture.componentInstance.writeValue(config.value ?? null);
  fixture.detectChanges();

  const componentWithTriggerQuery = fixture.componentInstance as unknown as {
    trigger: () => ElementRef<HTMLButtonElement>;
  };
  try {
    componentWithTriggerQuery.trigger();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('NG0951')) throw error;
    Object.defineProperty(componentWithTriggerQuery, 'trigger', {
      value: () => new ElementRef(triggerOf(fixture)),
    });
  }
  return fixture;
}

function triggerOf(fixture: ReturnType<typeof createSelect>): HTMLButtonElement {
  return fixture.nativeElement.querySelector('[role="combobox"], button') as HTMLButtonElement;
}

function optionElements(fixture: ReturnType<typeof createSelect>): HTMLButtonElement[] {
  const semanticOptions = fixture.nativeElement.querySelectorAll('[role="option"]');
  return Array.from(
    semanticOptions.length
      ? semanticOptions
      : fixture.nativeElement.querySelectorAll('.custom-select-menu button'),
  );
}

function activeIndexOf(fixture: ReturnType<typeof createSelect>): number {
  const component = fixture.componentInstance as unknown as { activeIndex?: () => number };
  return component.activeIndex?.() ?? -1;
}

function keydown(fixture: ReturnType<typeof createSelect>, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  triggerOf(fixture).dispatchEvent(event);
  fixture.detectChanges();
  return event;
}

async function flushQueuedFocus(fixture: ReturnType<typeof createSelect>): Promise<void> {
  await Promise.resolve();
  fixture.detectChanges();
}

describe('CustomSelectComponent', () => {
  it.each(['default', 'pill', 'filter'] as const)(
    'rendert die %s-Variante als benannte geschlossene Combobox',
    (variant) => {
      const fixture = createSelect({ variant });
      const trigger = triggerOf(fixture);

      expect(trigger.tagName).toBe('BUTTON');
      expect(trigger.getAttribute('role')).toBe('combobox');
      expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(trigger.getAttribute('aria-label')).toBe('Plattform filtern');
      expect(trigger.hasAttribute('aria-controls')).toBe(false);
      expect(trigger.hasAttribute('aria-activedescendant')).toBe(false);

      keydown(fixture, 'ArrowDown');
      expect(fixture.componentInstance.isOpen()).toBe(true);
    },
  );

  it('verknüpft Trigger, Listbox und aktive Option nur im geöffneten Zustand', () => {
    const fixture = createSelect({ value: 'ebay' });
    const trigger = triggerOf(fixture);

    trigger.click();
    fixture.detectChanges();

    const listbox = fixture.nativeElement.querySelector('[role="listbox"]') as HTMLElement | null;
    const activeId = trigger.getAttribute('aria-activedescendant');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(listbox?.id ?? null);
    expect(activeId).not.toBeNull();
    expect(fixture.nativeElement.querySelector(`#${activeId}`)?.getAttribute('role')).toBe(
      'option',
    );
    expect(optionElements(fixture).map((option) => option.getAttribute('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
    ]);
  });

  it('vergibt über zwei Instanzen hinweg eindeutige IDs und respektiert eine triggerId', () => {
    const first = createSelect({ triggerId: 'dashboard-platform' });
    const second = createSelect();
    triggerOf(first).click();
    triggerOf(second).click();
    first.detectChanges();
    second.detectChanges();

    const ids = [first, second].flatMap((fixture) =>
      Array.from(fixture.nativeElement.querySelectorAll('[id]'), (element: Element) => element.id),
    );
    expect(triggerOf(first).id).toBe('dashboard-platform');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('schließt eine offene Instanz, wenn der Trigger einer anderen Instanz geklickt wird', () => {
    const first = createSelect();
    const second = createSelect();
    triggerOf(first).click();
    first.detectChanges();

    triggerOf(second).click();
    first.detectChanges();
    second.detectChanges();

    expect(first.componentInstance.isOpen()).toBe(false);
    expect(second.componentInstance.isOpen()).toBe(true);
  });

  it.each([
    ['Enter', 'vinted', 2],
    [' ', null, 0],
  ] as const)(
    'öffnet mit %s und aktiviert die gewählte oder erste Option',
    (key, value, expectedIndex) => {
      const fixture = createSelect({ value });

      const event = keydown(fixture, key);

      expect(event.defaultPrevented).toBe(true);
      expect(fixture.componentInstance.isOpen()).toBe(true);
      expect(activeIndexOf(fixture)).toBe(expectedIndex);
      expect(fixture.componentInstance.value()).toBe(value);
    },
  );

  it('öffnet mit ArrowDown bei der Auswahl und navigiert vorwärts mit Endbegrenzung', () => {
    const fixture = createSelect({ value: 'ebay' });

    keydown(fixture, 'ArrowDown');
    expect(activeIndexOf(fixture)).toBe(1);
    keydown(fixture, 'ArrowDown');
    expect(activeIndexOf(fixture)).toBe(2);
    keydown(fixture, 'ArrowDown');

    expect(activeIndexOf(fixture)).toBe(2);
    expect(fixture.componentInstance.value()).toBe('ebay');

    const fixtureWithoutSelection = createSelect();
    keydown(fixtureWithoutSelection, 'ArrowDown');
    expect(activeIndexOf(fixtureWithoutSelection)).toBe(0);
  });

  it('öffnet mit ArrowUp ohne Auswahl am Ende und navigiert rückwärts mit Startbegrenzung', () => {
    const fixture = createSelect();

    keydown(fixture, 'ArrowUp');
    expect(activeIndexOf(fixture)).toBe(2);
    keydown(fixture, 'ArrowUp');
    keydown(fixture, 'ArrowUp');
    keydown(fixture, 'ArrowUp');

    expect(activeIndexOf(fixture)).toBe(0);
    expect(fixture.componentInstance.value()).toBeNull();

    const fixtureWithSelection = createSelect({ value: 'ebay' });
    keydown(fixtureWithSelection, 'ArrowUp');
    expect(activeIndexOf(fixtureWithSelection)).toBe(1);
  });

  it('aktiviert mit Home und End die erste und letzte Option ohne Wertänderung', () => {
    const fixture = createSelect({ value: 'ebay' });
    keydown(fixture, 'Enter');

    keydown(fixture, 'End');
    expect(activeIndexOf(fixture)).toBe(2);
    keydown(fixture, 'Home');

    expect(activeIndexOf(fixture)).toBe(0);
    expect(fixture.componentInstance.value()).toBe('ebay');
  });

  it('behält bei einer leeren Optionsliste den aktiven Index -1 ohne aktiven Nachfahren', () => {
    const fixture = createSelect({ options: [] });

    keydown(fixture, 'ArrowDown');

    expect(activeIndexOf(fixture)).toBe(-1);
    expect(triggerOf(fixture).hasAttribute('aria-activedescendant')).toBe(false);
    expect(optionElements(fixture)).toEqual([]);
  });

  it('verweist nach signalbasiertem Schrumpfen nie auf eine fehlende aktive Option', () => {
    const fixture = createSelect({ value: 'vinted' });
    keydown(fixture, 'ArrowDown');
    expect(triggerOf(fixture).getAttribute('aria-activedescendant')).toBe(
      optionElements(fixture)[2]?.id,
    );

    fixture.componentRef.setInput('options', options.slice(0, 1));
    fixture.detectChanges();

    expect(triggerOf(fixture).hasAttribute('aria-activedescendant')).toBe(false);

    fixture.componentRef.setInput('options', []);
    fixture.detectChanges();

    expect(triggerOf(fixture).hasAttribute('aria-activedescendant')).toBe(false);
  });

  it.each(['Enter', ' '] as const)(
    'wählt mit %s die aktive Option genau einmal und stellt den Triggerfokus wieder her',
    async (key) => {
      const fixture = createSelect();
      const onChange = vi.fn<(value: string | null) => void>();
      fixture.componentInstance.registerOnChange(onChange);
      keydown(fixture, 'ArrowDown');
      keydown(fixture, 'ArrowDown');
      optionElements(fixture)[1]?.focus();

      keydown(fixture, key);
      await flushQueuedFocus(fixture);

      expect(fixture.componentInstance.value()).toBe('ebay');
      expect(onChange).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenCalledWith('ebay');
      expect(fixture.componentInstance.isOpen()).toBe(false);
      expect(document.activeElement).toBe(triggerOf(fixture));
    },
  );

  it('schließt mit Escape ohne Wertänderung und stellt den Triggerfokus wieder her', async () => {
    const fixture = createSelect({ value: 'ebay' });
    const onChange = vi.fn<(value: string | null) => void>();
    fixture.componentInstance.registerOnChange(onChange);
    keydown(fixture, 'ArrowDown');
    optionElements(fixture)[0]?.focus();

    keydown(fixture, 'Escape');
    await flushQueuedFocus(fixture);

    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(fixture.componentInstance.value()).toBe('ebay');
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(triggerOf(fixture));
  });

  it('schließt mit Tab ohne preventDefault und überlässt die Fokusbewegung dem Browser', () => {
    const fixture = createSelect();
    keydown(fixture, 'Enter');
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    triggerOf(fixture).dispatchEvent(event);
    fixture.detectChanges();

    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('wählt per Pointer genau einmal und stellt den Triggerfokus wieder her', async () => {
    const fixture = createSelect();
    const onChange = vi.fn<(value: string | null) => void>();
    fixture.componentInstance.registerOnChange(onChange);
    triggerOf(fixture).click();
    fixture.detectChanges();
    optionElements(fixture)[2]?.focus();

    optionElements(fixture)[2]?.click();
    fixture.detectChanges();
    await flushQueuedFocus(fixture);

    expect(fixture.componentInstance.value()).toBe('vinted');
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('vinted');
    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(document.activeElement).toBe(triggerOf(fixture));
  });

  it('schließt bei einem Außenklick ohne Wertänderung', () => {
    const fixture = createSelect({ value: 'ebay' });
    const onChange = vi.fn<(value: string | null) => void>();
    fixture.componentInstance.registerOnChange(onChange);
    triggerOf(fixture).click();
    fixture.detectChanges();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(fixture.componentInstance.value()).toBe('ebay');
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['Input', 'CVA'] as const)(
    'blockiert Öffnen und Auswahl im deaktivierten %s-Zustand',
    (source) => {
      const fixture = createSelect();
      const onChange = vi.fn<(value: string | null) => void>();
      fixture.componentInstance.registerOnChange(onChange);

      triggerOf(fixture).click();
      fixture.detectChanges();
      if (source === 'Input') fixture.componentRef.setInput('disabled', true);
      else fixture.componentInstance.setDisabledState(true);
      fixture.detectChanges();
      keydown(fixture, 'Enter');
      expect(fixture.componentInstance.isOpen()).toBe(true);
      optionElements(fixture)[1]?.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.value()).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
      fixture.componentInstance.closeDropdown(false);
      fixture.detectChanges();
      triggerOf(fixture).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();
      expect(fixture.componentInstance.isOpen()).toBe(false);
      expect(triggerOf(fixture).disabled).toBe(true);
      expect(triggerOf(fixture).getAttribute('aria-disabled')).toBe('true');
    },
  );

  it.each([
    ['geschlossen', false, false],
    ['geöffnet', true, false],
    ['deaktiviert', false, true],
  ] as const)('besteht AXE im Zustand %s', async (_state, open, disabled) => {
    const fixture = createSelect({ disabled });
    if (open) {
      triggerOf(fixture).click();
      fixture.detectChanges();
    }

    const result = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });

    expect(result.violations).toEqual([]);
  });
});
