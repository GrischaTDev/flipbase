import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ButtonComponent } from './button.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

let inputMetadataSnapshot: AngularInputMetadata | null = null;

beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

describe('ButtonComponent', () => {
  it('liefert den gemessenen Suchauslöser als gemeinsame 36-Pixel-Variante', () => {
    fixture.componentRef.setInput('size', 'search');
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.classList.contains('h-9')).toBe(true);
    expect(button.classList.contains('px-2')).toBe(true);
    expect(button.classList.contains('rounded-lg')).toBe(true);
  });
  it('übermittelt den umschaltbaren Zustand an den nativen Button', () => {
    fixture.componentRef.setInput('ariaPressed', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button').getAttribute('aria-pressed')).toBe('true');
    fixture.componentRef.setInput('ariaPressed', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button').getAttribute('aria-pressed')).toBe(
      'false',
    );
  });
  let component: ButtonComponent;
  let fixture: ComponentFixture<ButtonComponent>;

  beforeEach(async () => {
    const metadata = (ButtonComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    inputMetadataSnapshot = {
      inputs: metadata.inputs,
      declaredInputs: metadata.declaredInputs,
    };
    metadata.inputs = {
      ...metadata.inputs,
      variant: ['variant', 1, null],
      tone: ['tone', 1, null],
      size: ['size', 1, null],
      loading: ['loading', 1, null],
      disabled: ['disabled', 1, null],
      icon: ['icon', 1, null],
      iconPosition: ['iconPosition', 1, null],
      iconOnly: ['iconOnly', 1, null],
      fullWidth: ['fullWidth', 1, null],
      contentAlign: ['contentAlign', 1, null],
      type: ['type', 1, null],
      ariaLabel: ['ariaLabel', 1, null],
      ariaPressed: ['ariaPressed', 1, null],
      title: ['title', 1, null],
      link: ['link', 1, null],
      href: ['href', 1, null],
      target: ['target', 1, null],
      queryParams: ['queryParams', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      variant: 'variant',
      tone: 'tone',
      size: 'size',
      loading: 'loading',
      disabled: 'disabled',
      icon: 'icon',
      iconPosition: 'iconPosition',
      iconOnly: 'iconOnly',
      fullWidth: 'fullWidth',
      contentAlign: 'contentAlign',
      type: 'type',
      ariaLabel: 'ariaLabel',
      ariaPressed: 'ariaPressed',
      title: 'title',
      link: 'link',
      href: 'href',
      target: 'target',
      queryParams: 'queryParams',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ButtonComponent],
      providers: [provideRouter([])],
    });

    fixture = TestBed.createComponent(ButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (!inputMetadataSnapshot) return;
    const metadata = (ButtonComponent as unknown as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = inputMetadataSnapshot.inputs;
    metadata.declaredInputs = inputMetadataSnapshot.declaredInputs;
  });

  it('behält zentrierten Inhalt und die umgebende native Formularzuordnung als Standard', () => {
    const form = document.createElement('form');
    const host = fixture.nativeElement as HTMLElement;
    host.append(form);
    const button = host.querySelector<HTMLButtonElement>('button');
    if (!button) throw new Error('Nativer Button fehlt.');
    form.append(button);

    expect(button.classList).toContain('justify-center');
    expect(button.classList).not.toContain('justify-start');
    expect(button.type).toBe('button');
    expect(button.getAttribute('form')).toBeNull();
    expect(button.form).toBe(form);
  });

  it('should be disabled when disabled input is true', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(component.effectiveDisabled()).toBe(true);

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.disabled).toBe(true);
  });

  it('richtet vollbreiten Text bei contentAlign start links aus', () => {
    fixture.componentRef.setInput('fullWidth', true);
    fixture.componentRef.setInput('contentAlign', 'start');
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button');
    expect(button.classList).toContain('justify-start');
    expect(button.classList).toContain('text-left');
    expect(button.classList).not.toContain('justify-center');
  });

  it('should be disabled and show loading state when loading input is true', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(component.effectiveDisabled()).toBe(true);

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
  });

  it('should emit clicked event when active button is clicked', () => {
    let emitted = false;
    component.clicked.subscribe(() => {
      emitted = true;
    });

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    btn.click();
    expect(emitted).toBe(true);
  });

  it('renders a slim icon-only action as a square button', () => {
    fixture.componentRef.setInput('size', 'slim');
    fixture.componentRef.setInput('iconOnly', true);
    fixture.componentRef.setInput('ariaLabel', 'Kosten bearbeiten');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.classList).toContain('h-7');
    expect(button.classList).toContain('w-7');
    expect(button.classList).toContain('px-0');
    expect(button.getAttribute('aria-label')).toBe('Kosten bearbeiten');
  });

  it('färbt jede Tabellenaktion beim Hover und kritische Aktionen rot', () => {
    fixture.componentRef.setInput('variant', 'table-action');
    fixture.componentRef.setInput('size', 'slim');
    fixture.componentRef.setInput('iconOnly', true);
    fixture.componentRef.setInput('ariaLabel', 'Verkauf retournieren');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.className).toContain('hover:bg-[var(--fb-color-brand-surface)]');
    expect(button.className).toContain('focus-visible:bg-[var(--fb-color-brand-surface)]');

    fixture.componentRef.setInput('tone', 'critical');
    fixture.detectChanges();

    expect(button.classList).toContain('h-7');
    expect(button.classList).toContain('w-7');
    expect(button.classList).toContain('rounded-lg');
    expect(button.classList).toContain('justify-center');
    expect(button.className).toContain('--fb-color-critical-surface');
    expect(button.className).toContain('focus-visible:outline-fb-text-primary');
    expect(button.getAttribute('aria-label')).toBe('Verkauf retournieren');
  });

  it('renders navigation as a native link with query parameters', () => {
    fixture.componentRef.setInput('link', '/audit');
    fixture.componentRef.setInput('queryParams', { purchaseId: 'purchase-1' });
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/audit?purchaseId=purchase-1');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('prevents navigation and click output while a linked action is loading', () => {
    fixture.componentRef.setInput('link', '/audit');
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    let emitted = false;
    component.clicked.subscribe(() => (emitted = true));

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBeNull();
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.getAttribute('tabindex')).toBe('-1');
    link.click();
    expect(emitted).toBe(false);
  });

  it('opens an external action as a native link in a protected new tab', () => {
    fixture.componentRef.setInput('href', 'https://www.vinted.de/items/123');
    fixture.componentRef.setInput('target', '_blank');
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://www.vinted.de/items/123');
    expect(link.target).toBe('_blank');
    expect(link.relList.contains('noopener')).toBe(true);
    expect(link.relList.contains('noreferrer')).toBe(true);
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('blocks a disabled external link and restores it when enabled', () => {
    fixture.componentRef.setInput('href', 'https://www.vinted.de/items/123');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    let emitted = false;
    component.clicked.subscribe(() => (emitted = true));

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    const click = new MouseEvent('click', { cancelable: true, bubbles: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(emitted).toBe(false);
    expect(link.getAttribute('href')).toBeNull();
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.tabIndex).toBe(-1);

    fixture.componentRef.setInput('disabled', false);
    fixture.detectChanges();
    expect(link.href).toBe('https://www.vinted.de/items/123');
    expect(link.getAttribute('tabindex')).toBeNull();
    expect(link.target).toBe('_self');
  });
});
