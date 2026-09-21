import '@angular/compiler';
import { Location } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function createPage(id = 'purchase-1') {
  const component = TestBed.runInInjectionContext(() => new PurchasePrintComponent());
  Object.defineProperty(component, 'id', { value: () => id });
  return component;
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
  const printTemplate = readFileSync(
    'src/app/features/purchases/pages/purchase-print/purchase-print.component.html',
    'utf8',
  );
  const detailTemplate = readFileSync(
    'src/app/features/purchases/pages/purchase-detail/purchase-detail.component.html',
    'utf8',
  );

  it('blendet die Bedienleiste beim Drucken aus und zeigt alle Abschnitte', () => {
    expect(printTemplate).toContain('print:hidden');
    for (const heading of ['Verkäufer', 'Positionen', 'Kosten', 'Belege', 'Gesamtkosten']) {
      expect(printTemplate).toContain(heading);
    }
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
