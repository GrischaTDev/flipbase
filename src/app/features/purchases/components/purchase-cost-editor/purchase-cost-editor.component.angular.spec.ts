import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { SelectOption } from '../../../../shared/components/custom-select/custom-select.component';
import { PurchaseCostEditorComponent } from './purchase-cost-editor.component';

async function erstelleEditor(
  purchaseType: 'lot' | 'mystery_pack',
  purchaseLineOptions: SelectOption<string>[] = [],
): Promise<ComponentFixture<PurchaseCostEditorComponent>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [PurchaseCostEditorComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(PurchaseCostEditorComponent);
  fixture.componentRef.setInput('purchaseType', purchaseType);
  fixture.componentRef.setInput('initialCosts', []);
  fixture.componentRef.setInput('purchaseLineOptions', purchaseLineOptions);
  fixture.detectChanges();
  return fixture;
}

function findeSchaltflaeche(host: HTMLElement, beschriftung: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === beschriftung,
  );
  if (!button) throw new Error(`Schaltfläche „${beschriftung}“ fehlt.`);
  return button;
}

// Signal-Inputs werden vom direkten Vitest-TS-Transform nicht kompiliert. Der
// fest hinterlegte AOT-Testbefehl führt dieselben DOM-Tests daher aus out-tsc aus.
describe.skipIf(!import.meta.url.includes('/out-tsc/'))('PurchaseCostEditorComponent', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources(async (url) => {
      const resourceUrl = String(url);
      if (!url || resourceUrl === 'undefined' || resourceUrl.endsWith('/undefined')) return '';
      if (resourceUrl.includes('custom-select.component.')) {
        const fileName = resourceUrl.split('/').at(-1);
        return readFile(`src/app/shared/components/custom-select/${fileName}`, 'utf8');
      }
      if (resourceUrl.includes('number-input.component.')) {
        const fileName = resourceUrl.split('/').at(-1);
        return readFile(`src/app/shared/components/number-input/${fileName}`, 'utf8');
      }
      return readFile(new URL(resourceUrl, import.meta.url), 'utf8');
    });
  });

  it('rendert eine beschriftete Zusatzkostenzeile und entfernt sie wieder', async () => {
    const fixture = await erstelleEditor('lot');
    const host = fixture.nativeElement as HTMLElement;

    findeSchaltflaeche(host, 'Kosten hinzufügen').click();
    fixture.detectChanges();

    expect(host.textContent).toContain('Art');
    expect(host.querySelector('input[aria-label="Betrag der Zusatzkosten"]')).not.toBeNull();
    expect(host.textContent).toContain('Beschreibung');
    expect(host.querySelectorAll('[aria-label="Zusatzkosten löschen"]')).toHaveLength(1);

    (host.querySelector('[aria-label="Zusatzkosten löschen"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelectorAll('[aria-label="Zusatzkosten löschen"]')).toHaveLength(0);
  });

  it('zeigt bei normalen Einkäufen alle Verteilungsarten nach dem Öffnen an', async () => {
    const fixture = await erstelleEditor('lot');
    const host = fixture.nativeElement as HTMLElement;
    findeSchaltflaeche(host, 'Kosten hinzufügen').click();
    fixture.detectChanges();

    findeSchaltflaeche(host, 'Verteilung ändern').click();
    fixture.detectChanges();
    expect(findeSchaltflaeche(host, 'Nach Warenwert')).not.toBeNull();
    findeSchaltflaeche(host, 'Nach Warenwert').click();
    fixture.detectChanges();

    expect(host.textContent).toContain('Nach Warenwert');
    expect(host.textContent).toContain('Nach Menge');
    expect(host.textContent).toContain('Direkt einer Position zuordnen');
  });

  it('akzeptiert eine direkte Zuordnung zu einer neuen Positions-Draft-ID', async () => {
    const fixture = await erstelleEditor('lot', [{ value: 'draft-camera', label: 'Kamera' }]);
    const host = fixture.nativeElement as HTMLElement;
    findeSchaltflaeche(host, 'Kosten hinzufügen').click();
    fixture.detectChanges();
    findeSchaltflaeche(host, 'Verteilung ändern').click();
    fixture.detectChanges();

    const allocationSelect = host.querySelectorAll('app-custom-select').item(1);
    (allocationSelect.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    findeSchaltflaeche(host, 'Direkt einer Position zuordnen').click();
    fixture.detectChanges();

    expect(host.textContent).toContain('Bitte wähle eine Zielposition aus.');
    const targetSelect = host.querySelectorAll('app-custom-select').item(2);
    (targetSelect.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    findeSchaltflaeche(host, 'Kamera').click();
    fixture.detectChanges();

    expect(fixture.componentInstance.costRows.at(0).controls.targetPurchaseLineId.value).toBe(
      'draft-camera',
    );
    expect(fixture.componentInstance.form.valid).toBe(true);
  });

  it('macht eine direkte Zuordnung ungültig, wenn ihre Positions-Draft-ID entfernt wird', async () => {
    const fixture = await erstelleEditor('lot', [{ value: 'draft-camera', label: 'Kamera' }]);
    const host = fixture.nativeElement as HTMLElement;
    findeSchaltflaeche(host, 'Kosten hinzufügen').click();
    fixture.detectChanges();
    findeSchaltflaeche(host, 'Verteilung ändern').click();
    fixture.detectChanges();

    const allocationSelect = host.querySelectorAll('app-custom-select').item(1);
    (allocationSelect.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    findeSchaltflaeche(host, 'Direkt einer Position zuordnen').click();
    fixture.detectChanges();

    const targetSelect = host.querySelectorAll('app-custom-select').item(2);
    (targetSelect.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    findeSchaltflaeche(host, 'Kamera').click();
    fixture.detectChanges();

    fixture.componentRef.setInput('purchaseLineOptions', []);
    fixture.detectChanges();

    expect(fixture.componentInstance.costRows.at(0).controls.targetPurchaseLineId.value).toBeNull();
    expect(fixture.componentInstance.form.valid).toBe(false);
    expect(host.textContent).toContain('Bitte wähle eine Zielposition aus.');
  });

  it('zeigt für Mystery-Boxen nur die feste gleichmäßige Verteilung', async () => {
    const fixture = await erstelleEditor('mystery_pack');
    const host = fixture.nativeElement as HTMLElement;
    findeSchaltflaeche(host, 'Kosten hinzufügen').click();
    fixture.detectChanges();

    expect(host.textContent).toContain('Gleichmäßig pro Stück');
    expect(host.textContent).not.toContain('Verteilung ändern');
    expect(host.textContent).not.toContain('Nach Warenwert');
    expect(host.querySelectorAll('app-custom-select')).toHaveLength(1);
  });
});
