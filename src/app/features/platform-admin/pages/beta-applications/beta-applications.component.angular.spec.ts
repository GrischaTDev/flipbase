import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BetaApplicationsComponent } from './beta-applications.component';
import { BetaApplicationService } from '../../services/beta-application.service';

// Ohne JIT-Vorlagenaufloesung meldet TestBed "Component is not resolved" fuer
// jede Komponente mit externem templateUrl - so laeuft auch jeder andere
// Komponententest in diesem Projekt (siehe cost-state.component.angular.spec.ts).
beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
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
      imports: [BetaApplicationsComponent],
      providers: [{ provide: BetaApplicationService, useValue: { list, decide } }],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

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
