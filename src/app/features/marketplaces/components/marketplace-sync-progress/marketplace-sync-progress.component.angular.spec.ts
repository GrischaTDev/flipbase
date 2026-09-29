import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { provideRouter } from '@angular/router';
import { prepareMarketplaceRendering } from '../../../../../../e2e/support/marketplace-rendering';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { ModalDialogDirective } from '../../../../shared/directives/modal-dialog.directive';
import { MarketplaceSyncProgressComponent } from './marketplace-sync-progress.component';

describe('MarketplaceSyncProgressComponent', () => {
  let fixture: ComponentFixture<MarketplaceSyncProgressComponent>;
  let component: MarketplaceSyncProgressComponent;
  let resetBindings: (() => void) | undefined;

  beforeAll(async () => {
    resetBindings = await prepareMarketplaceRendering([
      { type: ModalDialogDirective, path: 'src/app/shared/directives/modal-dialog.directive.ts' },
      {
        type: ModalShellComponent,
        path: 'src/app/shared/components/modal-shell/modal-shell.component.ts',
      },
      { type: ButtonComponent, path: 'src/app/shared/components/button/button.component.ts' },
      {
        type: MarketplaceSyncProgressComponent,
        path: 'src/app/features/marketplaces/components/marketplace-sync-progress/marketplace-sync-progress.component.ts',
      },
    ]);
  });

  afterAll(() => resetBindings?.());

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [MarketplaceSyncProgressComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(MarketplaceSyncProgressComponent);
    component = fixture.componentInstance;
  });

  it('erstellt die Komponente erfolgreich', () => {
    expect(component).toBeTruthy();
  });

  it('zeigt keine Diagnose-Details im regulären fehlerfreien Zustand', () => {
    fixture.componentRef.setInput('progress', {
      id: 'op-1',
      state: 'running',
      stage: 'profile',
      errorCode: null,
    });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Profil abrufen');
    expect(element.querySelector('button[aria-controls="sync-diagnostics-panel"]')).toBeNull();
  });

  it('zeigt den Diagnose-Umschalter bei aufgetretenem Fehler an und lässt sich öffnen', () => {
    fixture.componentRef.setInput('progress', {
      id: 'op-fail-1',
      state: 'failed',
      stage: 'profile',
      errorCode: 'identity',
    });
    fixture.componentRef.setInput('error', 'Vinted bestätigt Deine Anmeldung nicht mehr.');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const toggleButton = element.querySelector<HTMLButtonElement>(
      'button[aria-controls="sync-diagnostics-panel"]',
    );
    expect(toggleButton).toBeTruthy();
    expect(toggleButton?.textContent).toContain('Diagnose-Details anzeigen');

    // Panel ist anfangs geschlossen
    expect(element.querySelector('#sync-diagnostics-panel')).toBeNull();

    // Klick zum Öffnen
    toggleButton?.click();
    fixture.detectChanges();

    const panel = element.querySelector('#sync-diagnostics-panel');
    expect(panel).toBeTruthy();
    expect(panel?.textContent).toContain('Abgebrochen bei:');
    expect(panel?.textContent).toContain('Profil abrufen');
    expect(panel?.textContent).toContain('identity');
    expect(panel?.textContent).toContain('Sitzung nicht mehr aktiv (HTTP 401)');
    expect(panel?.textContent).toContain('op-fail-1');
    expect(panel?.textContent).toContain('docker logs --tail 100 flipbase-marketplace-worker');
  });

  it('zeigt bei Fehlern außerhalb von identity einen Prüfungs-Button an', () => {
    fixture.componentRef.setInput('progress', {
      id: 'op-fail-2',
      state: 'failed',
      stage: 'publications',
      errorCode: 'publications',
    });
    fixture.componentRef.setInput('error', 'Inserate konnten nicht geladen werden.');
    fixture.componentRef.setInput('reconnectLink', '/marketplaces/vinted/connect/conn-1');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const actionButton = element.querySelector<HTMLAnchorElement>('a');
    expect(actionButton).toBeTruthy();
    expect(actionButton?.textContent).toContain('Browser-Ansicht zur Prüfung öffnen');
    expect(actionButton?.getAttribute('href')).toBe('/marketplaces/vinted/connect/conn-1');
  });

  it('kopiert den Server-Logbefehl über den Button in die Zwischenablage', async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextSpy },
    });

    fixture.componentRef.setInput('progress', {
      id: 'op-fail-3',
      state: 'failed',
      stage: 'browser',
      errorCode: 'browser',
    });
    fixture.componentRef.setInput('error', 'Browser konnte nicht gestartet werden.');
    fixture.detectChanges();

    component.toggleDiagnostics();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const copyButton = element.querySelector<HTMLButtonElement>('#sync-diagnostics-panel button');
    expect(copyButton).toBeTruthy();
    expect(copyButton?.textContent).toContain('Kopieren');

    await component.copyCommand();
    fixture.detectChanges();

    expect(writeTextSpy).toHaveBeenCalledWith('docker logs --tail 100 flipbase-marketplace-worker');
    expect(component.copiedCommand()).toBe(true);
  });

  it('erfüllt Barrierefreiheitsanforderungen (axe)', async () => {
    fixture.componentRef.setInput('progress', {
      id: 'op-axe',
      state: 'failed',
      stage: 'profile',
      errorCode: 'identity',
    });
    fixture.componentRef.setInput('error', 'Vinted bestätigt Deine Anmeldung nicht mehr.');
    fixture.detectChanges();

    component.toggleDiagnostics();
    fixture.detectChanges();

    const results = await axe.run(fixture.nativeElement, {
      rules: {
        // Modal-Shell Renderings im Test ohne Document-Body ausklammern
        region: { enabled: false },
      },
    });
    expect(results.violations).toEqual([]);
  });
});
