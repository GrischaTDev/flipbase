import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { PlatformUser } from '../../models/platform-user.model';
import { PlatformUserService } from '../../services/platform-user.service';
import { PlatformUsersComponent } from './platform-users.component';

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
  registerSignalInputs(PageHeaderComponent, ['icon']);
  registerSignalInputs(DataTableComponent, [
    'ariaLabel',
    'searchValue',
    'searchPlaceholder',
    'searchAriaLabel',
    'columns',
    'sortOptions',
    'currentSort',
    'viewModified',
    'loading',
    'errorMessage',
    'hasRows',
    'loadingText',
    'emptyTitle',
    'emptyText',
  ]);
  registerSignalInputs(BadgeComponent, ['tone', 'mono']);
  registerSignalInputs(TableActionButtonComponent, [
    'icon',
    'label',
    'link',
    'tone',
    'disabled',
    'loading',
    'href',
    'queryParams',
  ]);
  registerSignalInputs(ButtonComponent, [
    'variant',
    'tone',
    'size',
    'icon',
    'iconOnly',
    'ariaLabel',
    'title',
    'disabled',
    'loading',
    'link',
    'href',
    'queryParams',
  ]);
});

const activeUser: PlatformUser = {
  userId: 'user-1',
  fullName: 'Anna Beispiel',
  email: 'anna@example.test',
  workspaceId: 'workspace-1',
  workspaceName: 'Anna Handel',
  applicationStatus: 'accepted' as const,
  invitationStatus: 'sent' as const,
  registeredAt: '2026-09-20T10:00:00.000Z',
  licenseStatus: 'active' as const,
  betaStartsAt: '2026-09-20T10:00:00.000Z',
  betaEndsAt: '2099-11-19T10:00:00.000Z',
  lastSignInAt: '2026-09-24T12:00:00.000Z',
  lastActionAt: '2026-09-25T14:00:00.000Z',
  purchasesCreated30Days: 2,
  salesRecorded30Days: 1,
};

describe('PlatformUsersComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  afterAll(() => {
    for (const [component, snapshot] of inputMetadataSnapshots) {
      const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
      metadata.inputs = snapshot.inputs;
      metadata.declaredInputs = snapshot.declaredInputs;
    }
  });

  async function render(users = [activeUser]) {
    const list = vi.fn().mockResolvedValue(users);
    await TestBed.configureTestingModule({
      imports: [PlatformUsersComponent],
      providers: [provideRouter([]), { provide: PlatformUserService, useValue: { list } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformUsersComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, list };
  }

  it('zeigt Konto, Workspace und gestartete Beta zusammen', async () => {
    const { fixture } = await render();
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Anna Beispiel');
    expect(text).toContain('anna@example.test');
    expect(text).toContain('Anna Handel');
    expect(text).toContain('Registriert');
    expect(text).toContain('Beta aktiv');
    expect(text).toContain('Noch');
    expect(text).toContain('24.09.2026');
    expect(text).toContain('25.09.2026');
    expect(
      fixture.nativeElement.querySelector('a[aria-label="Nutzung von Anna Beispiel ansehen"]'),
    ).not.toBeNull();
  });

  it('unterscheidet wartende Registrierung und abgelaufene Beta', async () => {
    const { fixture } = await render([
      {
        ...activeUser,
        userId: 'user-2',
        fullName: 'Wartet Noch',
        registeredAt: null,
        licenseStatus: 'pending',
        betaStartsAt: null,
        betaEndsAt: null,
      },
      {
        ...activeUser,
        userId: 'user-3',
        fullName: 'Beta Vorbei',
        betaEndsAt: '2020-01-01T00:00:00.000Z',
      },
    ]);

    expect(fixture.nativeElement.textContent).toContain('Wartet auf Registrierung');
    expect(fixture.nativeElement.textContent).toContain('Beta abgelaufen');
  });
});
