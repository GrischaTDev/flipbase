import '@angular/compiler';
import { EventEmitter, signal, ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Supplier } from '../../core/models/flipbase.models';
import { SuppliersService } from '../../core/services/suppliers.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CustomSelectComponent } from '../../shared/components/custom-select/custom-select.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ToastService } from '../../shared/components/toast/toast.service';
import { PurchaseSellerDialogComponent } from './components/purchase-seller-dialog/purchase-seller-dialog.component';
import { SellersComponent } from './sellers.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
  outputs?: Record<string, string>;
}

const inputMetadataSnapshots = new Map<unknown, AngularInputMetadata>();
let customSelectOutputsSnapshot: Record<string, string> | undefined;
let customSelectValueChangeDescriptor: PropertyDescriptor | undefined;

function registerSignalInputs(component: unknown, inputNames: readonly string[]): void {
  const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
  inputMetadataSnapshots.set(component, {
    inputs: metadata.inputs,
    declaredInputs: metadata.declaredInputs,
  });
  metadata.inputs = {
    ...metadata.inputs,
    ...Object.fromEntries(inputNames.map((name) => [name, [name, 1, null]])),
  };
  metadata.declaredInputs = {
    ...metadata.declaredInputs,
    ...Object.fromEntries(inputNames.map((name) => [name, name])),
  };
}

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
  registerSignalInputs(PageHeaderComponent, ['title', 'subtitle', 'icon']);
  registerSignalInputs(ButtonComponent, ['variant', 'size', 'icon']);
  registerSignalInputs(BadgeComponent, ['tone', 'mono']);
  registerSignalInputs(CustomSelectComponent, [
    'options',
    'value',
    'variant',
    'size',
    'widthClass',
    'ariaLabel',
    'triggerId',
  ]);
  const customSelectMetadata = (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata })
    .ɵcmp;
  customSelectOutputsSnapshot = customSelectMetadata.outputs;
  customSelectMetadata.outputs = {
    ...customSelectMetadata.outputs,
    valueChange: 'valueChange',
  };
  customSelectValueChangeDescriptor = Object.getOwnPropertyDescriptor(
    CustomSelectComponent.prototype,
    'valueChange',
  );
  Object.defineProperty(CustomSelectComponent.prototype, 'valueChange', {
    configurable: true,
    value: new EventEmitter<string | null>(),
  });
  registerSignalInputs(PurchaseSellerDialogComponent, ['seller']);
});

afterEach(() => TestBed.resetTestingModule());

afterAll(() => {
  for (const [component, snapshot] of inputMetadataSnapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
  }
  const customSelectMetadata = (CustomSelectComponent as unknown as { ɵcmp: AngularInputMetadata })
    .ɵcmp;
  customSelectMetadata.outputs = customSelectOutputsSnapshot;
  if (customSelectValueChangeDescriptor) {
    Object.defineProperty(
      CustomSelectComponent.prototype,
      'valueChange',
      customSelectValueChangeDescriptor,
    );
  } else {
    delete (CustomSelectComponent.prototype as { valueChange?: unknown }).valueChange;
  }
});

const sellers: Supplier[] = [
  {
    id: 'company-1',
    workspace_id: 'workspace-1',
    seller_type: 'business',
    name: 'Close Vintage',
    contact_person: 'Ada Beispiel',
    email: 'mail@example.com',
    phone: '+491701234567',
    city: 'Berlin',
    country_code: 'DE',
    is_active: true,
  },
  {
    id: 'private-1',
    workspace_id: 'workspace-1',
    seller_type: 'private',
    name: 'Max Beispiel',
    country_code: 'AT',
    is_active: true,
  },
];

function render(initialSellers: Supplier[] = sellers) {
  const suppliersService = {
    suppliers: signal(initialSellers),
    isLoading: signal(false),
    zeigeArchivierte: signal(false),
    neuLaden: vi.fn().mockResolvedValue(undefined),
    setSupplierArchiviert: vi.fn().mockResolvedValue({ error: null }),
  };
  const fixture = TestBed.configureTestingModule({
    imports: [SellersComponent],
    providers: [
      { provide: SuppliersService, useValue: suppliersService },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
  }).createComponent(SellersComponent);
  fixture.detectChanges();

  return { fixture, suppliersService };
}

describe('SellersComponent', () => {
  it('zeigt die Verkäuferverwaltung als Tabelle mit genau einem Typfilter', () => {
    const { fixture } = render();
    const host = fixture.nativeElement as HTMLElement;
    const headings = [...host.querySelectorAll('th')].map((heading) => heading.textContent?.trim());
    const filters = fixture.debugElement
      .queryAll(By.directive(CustomSelectComponent))
      .map((debugElement) => debugElement.componentInstance as CustomSelectComponent<string>);
    const filter = filters[0];

    expect(host.querySelector('h1')?.textContent).toContain('Verkäufer');
    expect(host.textContent).toContain('Verkäufer erstellen');
    expect(filters).toHaveLength(1);
    expect(filter?.options().map((option) => option.label)).toEqual([
      'Alle',
      'Unternehmen',
      'Privatpersonen',
    ]);
    expect(headings).toEqual([
      'Name / Firma',
      'Typ',
      'Kontaktperson',
      'E-Mail / Telefon',
      'Ort / Land',
      'Status',
      'Aktionen',
    ]);
    expect(host.textContent).not.toContain('Einkaufsquellen');
  });

  it('filtert Tabellenzeilen nach Unternehmen und Privatpersonen', () => {
    const { fixture } = render();
    const filter = fixture.debugElement.query(By.directive(CustomSelectComponent))
      .componentInstance as CustomSelectComponent<string>;
    (filter as unknown as { valueChange: EventEmitter<string | null> }).valueChange.emit('company');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[data-seller-row]')).toHaveLength(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Close Vintage');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Max Beispiel');
  });

  it('zeigt bei leerer Liste eine verständliche Startansicht', () => {
    const { fixture } = render([]);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Noch keine Verkäufer');
  });

  it('erfüllt die automatischen Barrierefreiheitsprüfungen', async () => {
    const { fixture } = render();

    const result = await axe.run(fixture.nativeElement as HTMLElement);
    expect(result.violations).toEqual([]);
  });
});
