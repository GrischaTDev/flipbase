import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BetaApplicationsComponent } from './beta-applications.component';
import { BetaApplicationService } from '../../services/beta-application.service';
import { TableColumnMenuComponent } from '../../../../shared/components/table-column-menu/table-column-menu.component';
import { TableSortHeaderComponent } from '../../../../shared/components/table-sort-header/table-sort-header.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';

interface AngularInputMetadata {
  inputs: Record<string, unknown>;
  declaredInputs: Record<string, string>;
}

const inputMetadataSnapshots = new Map<unknown, AngularInputMetadata>();

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

// Ohne JIT-Vorlagenaufloesung meldet TestBed "Component is not resolved" fuer
// jede Komponente mit externem templateUrl - so laeuft auch jeder andere
// Komponententest in diesem Projekt (siehe cost-state.component.angular.spec.ts).
beforeAll(async () => {
  const resources: Record<string, string> = {
    './beta-applications.component.html':
      'src/app/features/platform-admin/pages/beta-applications/beta-applications.component.html',
    './table-column-menu.component.html':
      'src/app/shared/components/table-column-menu/table-column-menu.component.html',
    './table-column-menu.component.scss':
      'src/app/shared/components/table-column-menu/table-column-menu.component.scss',
    './table-sort-header.component.html':
      'src/app/shared/components/table-sort-header/table-sort-header.component.html',
    './page-header.component.html':
      'src/app/shared/components/page-header/page-header.component.html',
    './page-header.component.scss':
      'src/app/shared/components/page-header/page-header.component.scss',
  };
  await ɵresolveComponentResources((url) => readFile(resolve(resources[url] ?? url), 'utf8'));
  registerSignalInputs(PageHeaderComponent, ['icon']);
  registerSignalInputs(TableColumnMenuComponent, [
    'columns',
    'sortOptions',
    'currentSort',
    'viewModified',
  ]);
  registerSignalInputs(TableSortHeaderComponent, [
    'label',
    'sortField',
    'currentSort',
    'description',
  ]);
});

const application = {
  id: 'a1',
  firstName: 'Anna',
  lastName: 'Beispiel',
  email: 'anna@example.test',
  status: 'open' as const,
  grantedDays: null,
  decisionNote: null,
  createdAt: '2026-09-05T08:00:00.000Z',
};

describe('BetaApplicationsComponent', () => {
  let list: ReturnType<typeof vi.fn>;
  let decide: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    list = vi.fn().mockResolvedValue([application]);
    decide = vi.fn().mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [
        BetaApplicationsComponent,
        TableColumnMenuComponent,
        TableSortHeaderComponent,
        PageHeaderComponent,
      ],
      providers: [{ provide: BetaApplicationService, useValue: { list, decide } }],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  afterAll(() => {
    for (const [component, snapshot] of inputMetadataSnapshots) {
      const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
      metadata.inputs = snapshot.inputs;
      metadata.declaredInputs = snapshot.declaredInputs;
    }
  });

  it('zeigt die geladenen Bewerbungen', async () => {
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Anna Beispiel');
    expect(fixture.nativeElement.textContent).toContain('anna@example.test');
  });

  it('nimmt eine Bewerbung mit der eingestellten Laufzeit an', async () => {
    // Der Test fuellt das Notizfeld im DOM und klickt den Knopf, statt
    // `accept()` direkt aufzurufen: Waere die Bindung im Template kaputt -
    // falsches Argument, Tippfehler bei `note.value` - bliebe ein direkter
    // Methodenaufruf gruen, obwohl die Anwendung selbst nichts mehr taete.
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const noteInput: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[aria-label="Notiz zur Entscheidung über Anna Beispiel"]',
    );
    noteInput.value = '  passt  ';
    noteInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const acceptButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      'button[aria-label="Bewerbung von Anna Beispiel annehmen"]',
    );
    acceptButton.click();
    await fixture.whenStable();

    // Die Notiz wird beschnitten; eine leere Notiz wird zu null, damit in der
    // Datenbank nicht zwischen "nichts gesagt" und "Leerzeichen" unterschieden
    // werden muss.
    expect(decide).toHaveBeenCalledWith('a1', 'accepted', 180, 'passt');
  });

  it('zeigt einen Ladefehler an, statt eine leere Liste vorzutäuschen', async () => {
    list.mockRejectedValueOnce(new Error('keine Verbindung'));
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('keine Verbindung');
    expect(fixture.nativeElement.textContent).not.toContain('Es liegt noch keine Bewerbung vor');
  });
});
