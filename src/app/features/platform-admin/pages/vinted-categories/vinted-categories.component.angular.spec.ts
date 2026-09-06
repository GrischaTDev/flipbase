import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { VintedCategoriesComponent } from './vinted-categories.component';
import { VintedCategoryService } from '../../services/vinted-category.service';
import { CategorySyncStatus } from '../../models/vinted-category.model';

// Ohne JIT-Vorlagenaufloesung meldet TestBed "Component is not resolved" fuer
// jede Komponente mit externem templateUrl - so laeuft auch jeder andere
// Komponententest in diesem Projekt (siehe beta-applications.component.angular.spec.ts).
beforeAll(async () => {
  await ɵresolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf8'));
});

const status: CategorySyncStatus = {
  refreshedAt: '2026-09-06T12:00:00+00:00',
  requestedAt: null,
  lastAttemptAt: '2026-09-06T12:00:00+00:00',
  categoryCount: 2920,
  lastError: null,
};

describe('VintedCategoriesComponent', () => {
  let fixture: ComponentFixture<VintedCategoriesComponent>;
  let serviceStub: {
    readStatus: ReturnType<typeof vi.fn>;
    requestRefresh: ReturnType<typeof vi.fn>;
  };

  const build = async (initial: CategorySyncStatus): Promise<void> => {
    serviceStub = {
      readStatus: vi.fn(async () => initial),
      requestRefresh: vi.fn(async () => undefined),
    };

    await TestBed.configureTestingModule({
      imports: [VintedCategoriesComponent],
      providers: [{ provide: VintedCategoryService, useValue: serviceStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(VintedCategoriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('zeigt die Zahl der Kategorien und den Zeitpunkt des letzten Einlesens', async () => {
    await build(status);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('2920');
  });

  it('fordert beim Knopfdruck eine Auffrischung an', async () => {
    await build(status);

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[data-testid="request-refresh"]',
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    expect(serviceStub.requestRefresh).toHaveBeenCalledOnce();
  });

  it('zeigt den letzten Fehler an, wenn einer vorliegt', async () => {
    await build({ ...status, lastError: 'Kein catalogTree im HTML gefunden' });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Kein catalogTree im HTML gefunden');
  });

  it('sagt es deutlich, wenn noch nie eingelesen wurde', async () => {
    await build({ ...status, refreshedAt: null, categoryCount: 0 });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Noch nie eingelesen');
  });
});
