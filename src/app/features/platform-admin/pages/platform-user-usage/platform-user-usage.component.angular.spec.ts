import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { glob, readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { PlatformUser } from '../../models/platform-user.model';
import { PlatformUserService } from '../../services/platform-user.service';
import { PlatformUserUsageComponent } from './platform-user-usage.component';

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

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource ${url} ist nicht eindeutig.`);
    return readFile(matches[0], 'utf8');
  });
  registerSignalInputs(PageHeaderComponent, ['title', 'subtitle', 'icon', 'backLink', 'backLabel']);
  registerSignalInputs(CardComponent, ['title', 'subtitle', 'variant']);
});

const user: PlatformUser = {
  userId: 'user-1',
  fullName: 'Anna Beispiel',
  email: 'anna@example.test',
  workspaceId: 'workspace-1',
  workspaceName: 'Anna Handel',
  applicationStatus: 'accepted',
  invitationStatus: 'sent',
  registeredAt: '2026-09-20T10:00:00.000Z',
  licenseStatus: 'active',
  betaStartsAt: '2026-09-20T10:00:00.000Z',
  betaEndsAt: '2026-11-19T10:00:00.000Z',
  lastSignInAt: '2026-09-24T12:00:00.000Z',
  lastActionAt: '2026-09-25T14:00:00.000Z',
  purchasesCreated30Days: 2,
  salesRecorded30Days: 1,
};

describe('PlatformUserUsageComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  afterAll(() => {
    for (const [component, snapshot] of inputMetadataSnapshots) {
      const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
      metadata.inputs = snapshot.inputs;
      metadata.declaredInputs = snapshot.declaredInputs;
    }
  });

  it('zeigt Login und belegte Kernaktionen getrennt an', async () => {
    const list = vi.fn().mockResolvedValue([user]);
    const listRecentActions = vi.fn().mockResolvedValue([
      {
        eventId: 'event-1',
        eventType: 'sale_recorded',
        createdAt: '2026-09-25T14:00:00.000Z',
      },
    ]);
    await TestBed.configureTestingModule({
      imports: [PlatformUserUsageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ userId: 'user-1' }) } },
        },
        { provide: PlatformUserService, useValue: { list, listRecentActions } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformUserUsageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false));
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('app-card');
    expect(cards.length).toBe(5);
    expect(cards[0].textContent).toContain('24.09.2026');
    expect(cards[1].textContent).toContain('25.09.2026');
    expect(cards[2].textContent).toContain('2');
    expect(cards[3].textContent).toContain('1');
    expect(cards[4].textContent).toContain('Verkauf erfasst');
    expect(fixture.nativeElement.textContent).toContain('Seitenbesuche und reine Leseaktivität');
    expect(listRecentActions).toHaveBeenCalledWith('user-1');

    const accessibility = await axe.run(fixture.nativeElement as HTMLElement, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(accessibility.violations).toEqual([]);
  });
});
