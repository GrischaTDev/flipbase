import '@angular/compiler';
import { ɵresolveComponentResources, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { PurchaseLifecycleActionsComponent } from './purchase-lifecycle-actions.component';

interface ComponentMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs: Record<string, string>;
}
let originalMetadata: ComponentMetadata;

beforeAll(async () => {
  await ɵresolveComponentResources((url) =>
    readFile(
      new URL(
        url.includes('button.component')
          ? '../../../../shared/components/button/' + url.replace(/^\.\//, '')
          : url,
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const metadata = (ButtonComponent as unknown as { ɵcmp: ComponentMetadata }).ɵcmp;
  originalMetadata = {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
    outputs: metadata.outputs,
  };
  metadata.inputs = { ...metadata.inputs };
  metadata.declaredInputs = { ...metadata.declaredInputs };
  for (const name of ['variant', 'size', 'disabled', 'link', 'queryParams']) {
    metadata.inputs[name] = [name, 1, null];
    metadata.declaredInputs[name] = name;
  }
  metadata.outputs = { ...metadata.outputs, clicked: 'clicked' };
});

afterAll(() =>
  Object.assign((ButtonComponent as unknown as { ɵcmp: ComponentMetadata }).ɵcmp, originalMetadata),
);

afterEach(() => TestBed.resetTestingModule());

function render(
  entryStatus: 'draft' | 'capturing' | 'finalized',
  saleHistoryState: 'idle' | 'loading' | 'recorded' | 'review_required' | 'none' | 'error' = 'idle',
  saleReviewInventoryItemId: string | null = null,
  workflow: {
    receiving: 'draft' | 'ordered' | 'partially_received' | 'received' | 'archived';
    shipment: 'not_shipped' | 'in_transit' | 'arrived';
    content: 'known' | 'unknown';
  } = { receiving: 'received', shipment: 'arrived', content: 'known' },
  editing = false,
  submitting = false,
  hasOpenPrices = false,
) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({
    imports: [PurchaseLifecycleActionsComponent],
    providers: [provideRouter([])],
  }).createComponent(PurchaseLifecycleActionsComponent);
  Object.assign(fixture.componentInstance, {
    entryStatus: signal(entryStatus),
    saleHistoryState: signal(saleHistoryState),
    saleReviewInventoryItemId: signal(saleReviewInventoryItemId),
    receivingStatus: signal(workflow.receiving),
    shipmentStatus: signal(workflow.shipment),
    contentStatus: signal(workflow.content),
    editing: signal(editing),
    submitting: signal(submitting),
    hasOpenPrices: signal(hasOpenPrices),
  });
  fixture.detectChanges();
  return fixture;
}

describe('PurchaseLifecycleActionsComponent', () => {
  it('blendet beim Bearbeiten nur die redundante Bearbeiten-Aktion aus', () => {
    const fixture = render(
      'draft',
      'idle',
      null,
      {
        receiving: 'draft',
        shipment: 'not_shipped',
        content: 'unknown',
      },
      true,
    );

    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Löschen',
      'Als bestellt markieren',
    ]);
    const ordered = vi.fn();
    fixture.componentInstance.orderedRequested.subscribe(ordered);
    buttons[1].click();
    expect(ordered).toHaveBeenCalledOnce();
  });

  it('erhält beim Bearbeiten die Abschlusssperre während der Übermittlung', () => {
    const fixture = render('capturing', 'idle', null, undefined, true, true);

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).not.toContain('Bearbeiten');
    const button = host.querySelector<HTMLButtonElement>('[data-finalize-purchase] button');
    expect(button?.disabled).toBe(true);
    const finalize = vi.fn();
    fixture.componentInstance.finalizeRequested.subscribe(finalize);
    button?.click();
    expect(finalize).not.toHaveBeenCalled();
  });

  it('ordnet sekundäre Entwurfsaktionen vor der primären Folgeaktion an', () => {
    const fixture = render('draft', 'idle', null, {
      receiving: 'draft',
      shipment: 'not_shipped',
      content: 'unknown',
    });
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Bearbeiten',
      'Löschen',
      'Als bestellt markieren',
    ]);
    const emitted = vi.fn();
    fixture.componentInstance.deleteRequested.subscribe(emitted);
    buttons[1].click();
    expect(emitted).toHaveBeenCalledOnce();
  });
  it.each(['draft', 'capturing'] as const)(
    'bietet für einen gespeicherten %s-Entwurf das Abschließen an',
    (entryStatus) => {
      const fixture = render(entryStatus);
      const host = fixture.nativeElement as HTMLElement;

      expect(host.querySelector('[data-finalize-purchase]')).not.toBeNull();
      expect(host.textContent).toContain('Erfassung abschließen');
      expect(host.querySelector('[data-delete-purchase]') !== null).toBe(entryStatus === 'draft');
    },
  );

  it('zeigt Wiederöffnen ausschließlich nach autoritativ bestätigtem Nichtverkauf', () => {
    for (const state of ['idle', 'loading', 'recorded', 'error'] as const) {
      const fixture = render('finalized', state);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[data-reopen-purchase]'),
      ).toBeNull();
      fixture.destroy();
    }

    const confirmed = render('finalized', 'none');
    expect(
      (confirmed.nativeElement as HTMLElement).querySelector('[data-reopen-purchase]'),
    ).not.toBeNull();
  });

  it('zeigt bei historischem Verkauf die Korrektur und bei Ladefehler einen Retry', () => {
    const recorded = render('finalized', 'recorded');
    expect(
      (recorded.nativeElement as HTMLElement).querySelector('[data-correct-purchase]'),
    ).not.toBeNull();

    const failed = render('finalized', 'error');
    const retry = (failed.nativeElement as HTMLElement).querySelector(
      '[data-retry-sale-history]',
    ) as HTMLButtonElement;
    expect(retry).not.toBeNull();
    expect((failed.nativeElement as HTMLElement).textContent).toContain(
      'Verkaufsverlauf konnte nicht geprüft werden',
    );
  });

  it('zeigt für unvollständige Legacy-Verkaufsdaten nur den klaren Prüfpfad', () => {
    const fixture = render('finalized', 'review_required', 'item-review');
    const host = fixture.nativeElement as HTMLElement;
    const link = host.querySelector<HTMLAnchorElement>('[data-review-purchase-item] a');

    expect(host.querySelector('[data-reopen-purchase]')).toBeNull();
    expect(host.querySelector('[data-correct-purchase]')).toBeNull();
    expect(link?.getAttribute('href')).toBe('/inventory/item-review');
    expect(link?.textContent).toContain('Artikel prüfen');
    expect(host.textContent).toContain('Verkaufsdaten prüfen und nachpflegen');
  });

  it('zeigt ohne autoritatives Artikelziel keine navigierbare Prüfaktion', () => {
    const fixture = render('finalized', 'review_required');
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-review-purchase-item]')).toBeNull();
    expect(host.querySelector('a')).toBeNull();
  });

  it('reicht die gerenderten Lifecycle-Aktionen als Events weiter', () => {
    const draft = render('draft');
    const finalize = vi.fn();
    draft.componentInstance.finalizeRequested.subscribe(finalize);
    (draft.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-finalize-purchase] button')
      ?.click();
    expect(finalize).toHaveBeenCalledOnce();

    const error = render('finalized', 'error');
    const retry = vi.fn();
    error.componentInstance.saleHistoryReloadRequested.subscribe(retry);
    (error.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-retry-sale-history] button')
      ?.click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('führt einen neuen Einkauf über bestellt und angekommen zur Inhaltserfassung', () => {
    const draft = render('draft', 'idle', null, {
      receiving: 'draft',
      shipment: 'not_shipped',
      content: 'unknown',
    });
    expect(draft.nativeElement.querySelector('[data-mark-ordered]')).not.toBeNull();
    expect(draft.nativeElement.querySelector('[data-finalize-purchase]')).toBeNull();

    const arrived = render('draft', 'idle', null, {
      receiving: 'ordered',
      shipment: 'arrived',
      content: 'unknown',
    });
    expect(arrived.nativeElement.querySelector('[data-capture-content]')).not.toBeNull();
    expect(arrived.nativeElement.querySelector('[data-finalize-purchase]')).toBeNull();
  });

  it('führt nach Bestellt direkt zu Angekommen und verlangt keine Sendungsverfolgung', () => {
    const fixture = render('draft', 'idle', null, {
      receiving: 'ordered',
      shipment: 'not_shipped',
      content: 'known',
    });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-mark-transit]')).toBeNull();
    expect(host.querySelector('[data-mark-arrived]')).not.toBeNull();
    expect(host.textContent).not.toContain('Unterwegs');
  });

  it('sperrt Ankunft, Inhaltserfassung und Abschluss bei offenen Einkaufspreisen', () => {
    const fixture = render(
      'capturing',
      'idle',
      null,
      { receiving: 'ordered', shipment: 'not_shipped', content: 'known' },
      false,
      false,
      true,
    );
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-mark-ordered]')).toBeNull();
    expect(host.querySelector('[data-mark-arrived]')).toBeNull();
    expect(host.querySelector('[data-capture-content]')).toBeNull();
    expect(host.querySelector('[data-finalize-purchase]')).toBeNull();
    expect(host.textContent).toContain('Einkaufspreise offen');
  });
});
