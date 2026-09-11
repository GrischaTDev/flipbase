import '@angular/compiler';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { PlatformPreviewComponent } from './platform-preview.component';
import { PlatformProfile, platformById } from '../../models/platform-profile';
import { NEUTRAL_LOOK } from '../../services/image-renderer';

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

afterEach(() => TestBed.resetTestingModule());

interface RenderOptions {
  isActive?: boolean;
  issue?: { width: number; height: number } | null;
  variant?: 'tile' | 'full';
  disabled?: boolean;
}

function render(
  platform: PlatformProfile,
  { isActive = false, issue = null, variant = 'tile', disabled = false }: RenderOptions = {},
): { host: HTMLElement; component: PlatformPreviewComponent } {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [PlatformPreviewComponent],
  }).createComponent(PlatformPreviewComponent);
  Object.assign(fixture.componentInstance, {
    platform: signal(platform),
    dataUrl: signal('blob:test'),
    crop: signal(null),
    look: signal(NEUTRAL_LOOK),
    isActive: signal(isActive),
    issue: signal(issue),
    variant: signal(variant),
    disabled: signal(disabled),
  });
  fixture.detectChanges();
  return { host: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
}

describe('Kachel als Plattformauswahl', () => {
  it('meldet beim Klick die Kennung der Plattform als Auswahl', () => {
    const platform = platformById('ebay');
    const { host, component } = render(platform);
    let emitted: string | null = null;
    component.selected.subscribe((id) => (emitted = id));

    const selectButton = host.querySelector('button[aria-label*="eBay"]') as HTMLButtonElement;
    selectButton.click();

    expect(emitted).toBe('ebay');
  });

  it('traegt aria-current nur an der aktiven Kachel', () => {
    const platform = platformById('ebay');

    const inactive = render(platform, { isActive: false });
    const inactiveButton = inactive.host.querySelector('button[aria-label*="eBay"]');
    expect(inactiveButton?.getAttribute('aria-current')).toBeNull();

    const active = render(platform, { isActive: true });
    const activeButton = active.host.querySelector('button[aria-label*="eBay"]');
    expect(activeButton?.getAttribute('aria-current')).toBe('true');
  });

  it('nennt im Auswahlknopf die Plattform und dass er sie auswaehlt', () => {
    const { host } = render(platformById('vinted'));
    const selectButton = host.querySelector('button[aria-label]') as HTMLButtonElement;

    expect(selectButton.getAttribute('aria-label')).toContain('Vinted');
    expect(selectButton.getAttribute('aria-label')).toMatch(/wählen|auswählen/);
  });

  it('meldet beim Klick auf "Groß ansehen" den Wunsch nach der Grossansicht', () => {
    const platform = platformById('kleinanzeigen');
    const { host, component } = render(platform);
    let emitted: string | null = null;
    component.enlargeRequested.subscribe((id) => (emitted = id));

    const buttons = Array.from(host.querySelectorAll('button'));
    const enlargeButton = buttons.find((b) => b.textContent?.includes('Groß ansehen'));

    expect(enlargeButton).toBeDefined();
    enlargeButton!.click();

    expect(emitted).toBe('kleinanzeigen');
  });

  it('gibt dem Vergroessern-Knopf einen plattformspezifischen Namen', () => {
    const { host } = render(platformById('kleinanzeigen'));

    const buttons = Array.from(host.querySelectorAll('button'));
    const enlargeButton = buttons.find((b) => b.textContent?.includes('Groß ansehen'));

    expect(enlargeButton?.getAttribute('aria-label')).toBe('Kleinanzeigen groß ansehen');
  });

  it('zeigt die Warnung nur, wenn ein Aufloesungsproblem gemeldet wird', () => {
    // `role="status"`, nicht `role="alert"`: Waehrend des Ziehens am
    // Zuschnitt aendern sich die Zahlen staendig - eine hoefliche statt
    // einer unterbrechenden Ansage.
    const platform = platformById('ebay');

    const withoutIssue = render(platform, { issue: null });
    expect(withoutIssue.host.querySelector('[role="status"]')).toBeNull();

    const withIssue = render(platform, { issue: { width: 300, height: 300 } });
    const status = withIssue.host.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.textContent).toContain('300');
    expect(status?.textContent).toContain('eBay');
  });

  it('sperrt Auswahl- und Vergroessern-Knopf, waehrend ein Export laeuft', () => {
    const { host } = render(platformById('ebay'), { disabled: true });

    const selectButton = host.querySelector('button[aria-label*="eBay"]') as HTMLButtonElement;
    const enlargeButton = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Groß ansehen'),
    ) as HTMLButtonElement;

    expect(selectButton.disabled).toBe(true);
    expect(enlargeButton.disabled).toBe(true);
  });

  it('meldet keine Auswahl, waehrend die Kachel gesperrt ist', () => {
    const { host, component } = render(platformById('ebay'), { disabled: true });
    let emitted: string | null = null;
    component.selected.subscribe((id) => (emitted = id));

    const selectButton = host.querySelector('button[aria-label*="eBay"]') as HTMLButtonElement;
    selectButton.click();

    expect(emitted).toBeNull();
  });

  it('rendert in der Grossansicht weder Auswahl- noch Vergroessern-Knopf', () => {
    const { host } = render(platformById('ebay'), { variant: 'full' });

    expect(host.querySelector('button[aria-label*="eBay"]')).toBeNull();
    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.some((b) => b.textContent?.includes('Groß ansehen'))).toBe(false);
  });
});
