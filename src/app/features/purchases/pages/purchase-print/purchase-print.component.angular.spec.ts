import '@angular/compiler';
import { Location } from '@angular/common';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { glob, readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Purchase, PurchaseLine } from '../../../../core/models/flipbase.models';
import { PurchaseDocument } from '../../../../core/models/purchase-document.models';
import { PurchaseDocumentService } from '../../../../core/services/purchase-document.service';
import { PurchaseService } from '../../../../core/services/purchase.service';
import { WorkspaceService } from '../../../../core/services/workspace.service';
import { PurchasePrintComponent } from './purchase-print.component';

const purchase = {
  id: 'purchase-1',
  workspace_id: 'workspace-1',
  record_number: 'EK-0042',
  type: 'single',
  title: 'Vinted-Jacke',
  purchase_date: '2026-09-18',
  purchase_price: 10,
  cost_allocation_mode: 'even',
} as Purchase;

const purchaseLines = signal<PurchaseLine[]>([]);
const documents = signal<readonly PurchaseDocument[]>([]);
const currentWorkspace = signal<{ id: string; name: string } | null>({
  id: 'workspace-1',
  name: 'Mein Laden',
});
const getPurchaseById = vi.fn(async (): Promise<Purchase | null> => purchase);
const loadForPurchase = vi.fn(async () => undefined);
const back = vi.fn();

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) {
      throw new Error(`Test-Ressource ${url} ist nicht eindeutig: ${matches.join(', ')}`);
    }
    return readFile(matches[0], 'utf8');
  });
});

function createPage(id = 'purchase-1') {
  const component = TestBed.runInInjectionContext(() => new PurchasePrintComponent());
  Object.defineProperty(component, 'id', { value: () => id });
  return component;
}

function renderPage(id = 'purchase-1'): ComponentFixture<PurchasePrintComponent> {
  const fixture = TestBed.createComponent(PurchasePrintComponent);
  Object.defineProperty(fixture.componentInstance, 'id', { value: () => id });
  fixture.detectChanges();
  return fixture;
}

function readCssBlock(styles: string, opening: string): string {
  const start = styles.indexOf(opening);
  if (start === -1) throw new Error(`CSS-Block fehlt: ${opening}`);
  const bodyStart = styles.indexOf('{', start);
  let depth = 0;

  for (let index = bodyStart; index < styles.length; index += 1) {
    if (styles[index] === '{') depth += 1;
    if (styles[index] === '}') depth -= 1;
    if (depth === 0) return styles.slice(start, index + 1);
  }

  throw new Error(`CSS-Block ist nicht abgeschlossen: ${opening}`);
}

async function settle(): Promise<void> {
  TestBed.tick();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  getPurchaseById.mockClear().mockResolvedValue(purchase);
  loadForPurchase.mockClear();
  back.mockClear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PurchaseService, useValue: { getPurchaseById, purchaseLines } },
      {
        provide: PurchaseDocumentService,
        useValue: { documents, loadForPurchase, loadError: signal<string | null>(null) },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      { provide: Location, useValue: { back } },
    ],
  });
});

describe('PurchasePrintComponent', () => {
  it('lädt Einkauf und Belege und baut daraus die Druckansicht', async () => {
    const page = createPage();
    await settle();

    expect(getPurchaseById).toHaveBeenCalledWith('purchase-1');
    expect(loadForPurchase).toHaveBeenCalledWith('purchase-1');
    expect(page.model()?.heading).toBe('EK-0042');
    expect(page.model()?.total).toBe(10);
    expect(page.error()).toBeNull();
    expect(page.isLoading()).toBe(false);
  });

  it('meldet einen nicht gefundenen Einkauf statt eine leere Seite zu zeigen', async () => {
    getPurchaseById.mockResolvedValue(null);
    const page = createPage('missing');
    await settle();

    expect(page.model()).toBeNull();
    expect(page.error()).toBe('Der Einkauf wurde nicht gefunden.');
  });

  it('druckt über den Browserdialog und geht zurück zur vorherigen Seite', () => {
    const page = createPage();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    try {
      page.print();
      page.back();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(print).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe('Einkauf-drucken-Vorlagen', () => {
  const globalStyles = readFileSync('src/styles.css', 'utf8');
  const detailTemplate = readFileSync(
    'src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html',
    'utf8',
  );

  it('zeigt den Browserhinweis in der nicht druckbaren Bedienleiste an', async () => {
    const fixture = renderPage();
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    const actionBar = page.querySelector<HTMLElement>('.print\\:hidden');

    expect(actionBar).not.toBeNull();
    expect(actionBar?.textContent).toContain(
      'Falls dein Browser URL und Datum ergänzt, deaktiviere im Druckdialog Kopf- und Fußzeilen.',
    );
  });

  it('begrenzt die globalen Druckregeln auf die Einkaufsdruckseite', () => {
    const printRules = readCssBlock(globalStyles, '@media print');
    const pageRules = readCssBlock(globalStyles, '@page purchase-receipt');

    for (const selector of [
      '[data-shell-sidebar]',
      '[data-shell-header]',
      '[data-shell-bottom-nav]',
      'app-confirm-dialog',
      '.fb-skip-link',
      '[data-shell-content]',
      '[data-shell-main]',
      'app-purchase-print',
    ]) {
      expect(printRules).toContain(`body:has(app-purchase-print) ${selector}`);
    }
    expect(printRules).toMatch(
      /\[data-shell-sidebar\],[\s\S]*\[data-shell-header\],[\s\S]*\[data-shell-bottom-nav\],[\s\S]*app-confirm-dialog,[\s\S]*\.fb-skip-link\s*\{[\s\S]*display:\s*none\s*!important;/,
    );
    expect(printRules).toMatch(
      /\[data-shell-content\]\s*\{[\s\S]*margin:\s*0\s*!important;[\s\S]*padding:\s*0\s*!important;[\s\S]*background:\s*#fff\s*!important;/,
    );
    expect(printRules).toMatch(
      /\[data-shell-main\]\s*\{[\s\S]*width:\s*100%\s*!important;[\s\S]*max-width:\s*none\s*!important;[\s\S]*padding:\s*0\s*!important;[\s\S]*animation:\s*none\s*!important;/,
    );
    expect(printRules).toMatch(/app-purchase-print\s*\{[\s\S]*page:\s*purchase-receipt;/);
    expect(printRules).toMatch(/break-inside:\s*avoid;/);
    expect(pageRules).toMatch(/size:\s*A4;/);
    expect(pageRules).toMatch(/margin:\s*12mm;/);
  });

  it('verlinkt die Druckseite ohne den entfernten Prüfbeleg', () => {
    const printLink = detailTemplate.indexOf('data-purchase-print-link');
    const auditLink = detailTemplate.indexOf('data-purchase-audit-print-link');

    expect(printLink).toBeGreaterThan(-1);
    expect(auditLink).toBe(-1);
    expect(detailTemplate).toContain(`[link]="'/purchases/' + p.id + '/print'"`);
    expect(detailTemplate).toContain('Einkauf drucken');
  });
});
