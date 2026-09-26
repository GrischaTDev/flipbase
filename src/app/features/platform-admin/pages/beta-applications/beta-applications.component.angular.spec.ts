import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BetaApplicationsComponent } from './beta-applications.component';
import { BetaApplicationService } from '../../services/beta-application.service';
import { TableSortHeaderComponent } from '../../../../shared/components/table-sort-header/table-sort-header.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { DataTableComponent } from '../../../../shared/components/data-table/data-table.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { TableActionButtonComponent } from '../../../../shared/components/table-action-button/table-action-button.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { BetaApprovalDialogComponent } from '../../components/beta-approval-dialog/beta-approval-dialog.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';

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
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) {
      throw new Error(`Test-Ressource ${url} ist nicht eindeutig: ${matches.join(', ')}`);
    }
    return readFile(matches[0], 'utf8');
  });
  registerSignalInputs(PageHeaderComponent, ['icon']);
  registerSignalInputs(DataTableComponent, [
    'ariaLabel',
    'searchValue',
    'searchPlaceholder',
    'searchAriaLabel',
    'searchEnabled',
    'toolbarVisible',
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
  registerSignalInputs(TableSortHeaderComponent, [
    'label',
    'sortField',
    'currentSort',
    'description',
  ]);
  registerSignalInputs(ButtonComponent, [
    'variant',
    'tone',
    'size',
    'icon',
    'disabled',
    'ariaLabel',
    'ariaPressed',
    'iconOnly',
    'title',
    'loading',
    'link',
    'href',
    'queryParams',
  ]);
  registerSignalInputs(TableActionButtonComponent, [
    'icon',
    'label',
    'tone',
    'disabled',
    'loading',
    'link',
    'href',
    'queryParams',
  ]);
  const buttonMetadata = (
    ButtonComponent as unknown as {
      ɵcmp: { outputs: Record<string, string> };
    }
  ).ɵcmp;
  buttonMetadata.outputs = { ...buttonMetadata.outputs, clicked: 'clicked' };
  const tableActionMetadata = (
    TableActionButtonComponent as unknown as {
      ɵcmp: { outputs: Record<string, string> };
    }
  ).ɵcmp;
  tableActionMetadata.outputs = { ...tableActionMetadata.outputs, clicked: 'clicked' };
  registerSignalInputs(BadgeComponent, ['tone', 'mono']);
  registerSignalInputs(BetaApprovalDialogComponent, ['application', 'processing', 'errorMessage']);
  registerSignalInputs(ModalShellComponent, ['title', 'subtitle', 'icon', 'iconTone', 'size']);
  registerSignalInputs(NumberInputComponent, ['id', 'min', 'max', 'step', 'unit', 'ariaLabel']);
});

const application = {
  id: 'a1',
  firstName: 'Anna',
  lastName: 'Beispiel',
  email: 'anna@example.test',
  status: 'open' as const,
  grantedDays: null,
  decisionNote: null,
  decidedAt: null,
  createdAt: '2026-09-05T08:00:00.000Z',
  receiptEmailStatus: 'sent' as const,
  receiptEmailSentAt: '2026-09-05T08:01:00.000Z',
  receiptEmailLastError: null,
  operatorEmailStatus: 'sent' as const,
  operatorEmailSentAt: '2026-09-05T08:01:00.000Z',
  operatorEmailLastError: null,
  authUserId: null,
  invitationStatus: 'not_sent' as const,
  invitationSentAt: null,
  invitationLastError: null,
  rejectionEmailStatus: 'not_sent' as const,
  rejectionEmailSentAt: null,
  rejectionEmailLastError: null,
  registeredAt: null,
  licenseStatus: null,
  betaEndsAt: null,
};

describe('BetaApplicationsComponent', () => {
  let list: ReturnType<typeof vi.fn>;
  let accept: ReturnType<typeof vi.fn>;
  let reject: ReturnType<typeof vi.fn>;
  let resendInvitation: ReturnType<typeof vi.fn>;
  let resendApplicationReceipt: ReturnType<typeof vi.fn>;
  let resendOperatorNotice: ReturnType<typeof vi.fn>;
  let resendRejection: ReturnType<typeof vi.fn>;
  let deleteRejected: ReturnType<typeof vi.fn>;
  let confirmDelete: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    list = vi.fn().mockResolvedValue([application]);
    accept = vi.fn().mockResolvedValue({ ...application, status: 'accepted' });
    reject = vi.fn().mockResolvedValue({ ...application, status: 'rejected' });
    resendInvitation = vi.fn().mockResolvedValue(application);
    resendApplicationReceipt = vi.fn().mockResolvedValue(application);
    resendOperatorNotice = vi.fn().mockResolvedValue(application);
    resendRejection = vi.fn().mockResolvedValue(application);
    deleteRejected = vi.fn().mockResolvedValue(undefined);
    confirmDelete = vi.fn().mockResolvedValue(true);

    await TestBed.configureTestingModule({
      imports: [
        BetaApplicationsComponent,
        DataTableComponent,
        TableSortHeaderComponent,
        PageHeaderComponent,
      ],
      providers: [
        {
          provide: BetaApplicationService,
          useValue: {
            list,
            accept,
            reject,
            resendInvitation,
            resendApplicationReceipt,
            resendOperatorNotice,
            resendRejection,
            deleteRejected,
          },
        },
        { provide: ConfirmDialogService, useValue: { frage: confirmDelete } },
      ],
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

  it('oeffnet die Annahme im Dialog und uebergibt dessen Laufzeit', async () => {
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const acceptButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Bewerbung von Anna Beispiel annehmen"]',
    );
    expect(acceptButton).not.toBeNull();
    acceptButton?.click();
    fixture.detectChanges();

    const dialog = fixture.debugElement.query(By.directive(BetaApprovalDialogComponent));
    expect(dialog).not.toBeNull();
    dialog.triggerEventHandler('approved', 60);
    await fixture.whenStable();

    expect(accept).toHaveBeenCalledWith('a1', 60);
    expect(fixture.nativeElement.textContent).not.toContain('Laufzeit bei Annahme');
    expect(fixture.nativeElement.querySelector('input[placeholder="Notiz (optional)"]')).toBeNull();
  });

  it('zeigt einen Einladungsfehler und startet den Wiederholungsversand', async () => {
    list.mockResolvedValueOnce([
      {
        ...application,
        status: 'accepted',
        grantedDays: 60,
        authUserId: 'user-1',
        invitationStatus: 'failed',
        invitationLastError: 'SMTP nicht erreichbar',
      },
    ]);
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Einladung fehlgeschlagen');
    const retryButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Einladung an anna@example.test erneut senden"]',
    );
    retryButton?.click();
    await fixture.whenStable();

    expect(resendInvitation).toHaveBeenCalledWith('a1');
  });

  it('haelt den Annahmedialog bei einem Versandfehler offen und wiederholt dort die Einladung', async () => {
    const failedApplication = {
      ...application,
      status: 'accepted' as const,
      grantedDays: 60,
      authUserId: 'user-1',
      invitationStatus: 'failed' as const,
      invitationLastError: 'SMTP nicht erreichbar',
    };
    accept.mockRejectedValueOnce(new Error('Die Einladung konnte nicht versendet werden.'));
    list.mockResolvedValueOnce([application]).mockResolvedValueOnce([failedApplication]);
    resendInvitation.mockResolvedValueOnce({
      ...failedApplication,
      invitationStatus: 'sent' as const,
      invitationLastError: null,
    });

    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const acceptButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Bewerbung von Anna Beispiel annehmen"]',
    );
    acceptButton?.click();
    fixture.detectChanges();

    let dialog = fixture.debugElement.query(By.directive(BetaApprovalDialogComponent));
    dialog.triggerEventHandler('approved', 60);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Die Einladung konnte nicht versendet werden.',
    );
    expect(fixture.nativeElement.textContent).toContain('Einladung erneut senden');
    dialog = fixture.debugElement.query(By.directive(BetaApprovalDialogComponent));
    dialog.triggerEventHandler('approved', 60);
    await fixture.whenStable();

    expect(accept).toHaveBeenCalledTimes(1);
    expect(resendInvitation).toHaveBeenCalledWith('a1');
  });

  it('unterscheidet aktive und abgelaufene Beta-Zugaenge', () => {
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    expect(
      fixture.componentInstance.lifecycleStatus({
        ...application,
        status: 'accepted',
        registeredAt: '2026-09-20T10:00:00.000Z',
        licenseStatus: 'active',
        betaEndsAt: '2099-11-19T10:00:00.000Z',
      }).label,
    ).toBe('Beta aktiv');
    expect(
      fixture.componentInstance.lifecycleStatus({
        ...application,
        status: 'accepted',
        registeredAt: '2026-09-20T10:00:00.000Z',
        licenseStatus: 'expired',
        betaEndsAt: '2026-09-21T10:00:00.000Z',
      }).label,
    ).toBe('Beta abgelaufen');
  });

  it('kennzeichnet offene, angenommene und abgelehnte Bewerbungen eindeutig', () => {
    const fixture = TestBed.createComponent(BetaApplicationsComponent);

    expect(fixture.componentInstance.lifecycleStatus(application)).toEqual({
      label: 'Offen',
      tone: 'caution',
    });
    expect(
      fixture.componentInstance.lifecycleStatus({ ...application, status: 'accepted' }),
    ).toEqual({ label: 'Angenommen', tone: 'success' });
    expect(
      fixture.componentInstance.lifecycleStatus({ ...application, status: 'rejected' }),
    ).toEqual({ label: 'Abgelehnt', tone: 'critical' });
  });

  it('bietet bei fehlgeschlagener Eingangsbestaetigung einen Wiederholungsversand an', async () => {
    list.mockResolvedValueOnce([
      {
        ...application,
        receiptEmailStatus: 'failed',
        receiptEmailLastError: 'SMTP nicht erreichbar',
      },
    ]);
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const retryButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Bestätigung an anna@example.test erneut senden"]',
    );
    retryButton?.click();
    await fixture.whenStable();

    expect(resendApplicationReceipt).toHaveBeenCalledWith('a1');
  });

  it('bietet bei fehlgeschlagener Ablehnungs-E-Mail einen Wiederholungsversand an', async () => {
    list.mockResolvedValueOnce([
      {
        ...application,
        status: 'rejected',
        rejectionEmailStatus: 'failed',
        rejectionEmailLastError: 'SMTP nicht erreichbar',
      },
    ]);
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const retryButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Ablehnung an anna@example.test erneut senden"]',
    );
    retryButton?.click();
    await fixture.whenStable();

    expect(resendRejection).toHaveBeenCalledWith('a1');
  });

  it('zeigt eine fehlgeschlagene Betreiber-Mail und bietet erneuten Versand an', async () => {
    list.mockResolvedValueOnce([
      {
        ...application,
        operatorEmailStatus: 'failed',
        operatorEmailLastError: 'SMTP nicht erreichbar',
      },
    ]);
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('Betreiber-Mail fehlgeschlagen');
    const retryButton = page.querySelector<HTMLButtonElement>(
      'button[aria-label="Betreiber-Benachrichtigung erneut senden"]',
    );
    retryButton?.click();
    await fixture.whenStable();
    expect(resendOperatorNotice).toHaveBeenCalledWith('a1');
  });

  it('loescht eine abgelehnte Bewerbung nach ausdruecklicher Bestaetigung', async () => {
    list.mockResolvedValueOnce([{ ...application, status: 'rejected' }]);
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const deleteButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Abgelehnte Bewerbung von Anna Beispiel löschen"]',
    );
    deleteButton?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(confirmDelete).toHaveBeenCalledWith(
      expect.objectContaining({ titel: 'Abgelehnte Bewerbung löschen?', gefahr: true }),
    );
    expect(deleteRejected).toHaveBeenCalledWith('a1');
    expect(fixture.nativeElement.textContent).not.toContain('Anna Beispiel');
  });

  it('laedt nach einem fehlgeschlagenen Ablehnungsversand den gespeicherten Status nach', async () => {
    const rejectedApplication = {
      ...application,
      status: 'rejected' as const,
      rejectionEmailStatus: 'failed' as const,
      rejectionEmailLastError: 'SMTP nicht erreichbar',
    };
    reject.mockRejectedValueOnce(new Error('Die Ablehnungs-E-Mail konnte nicht versendet werden.'));
    list.mockResolvedValueOnce([application]).mockResolvedValueOnce([rejectedApplication]);
    const fixture = TestBed.createComponent(BetaApplicationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const rejectButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      'button[aria-label="Bewerbung von Anna Beispiel ablehnen"]',
    );
    rejectButton?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(list).toHaveBeenCalledTimes(2);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(
        'button[aria-label="Ablehnung an anna@example.test erneut senden"]',
      ),
    ).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'Die Ablehnungs-E-Mail konnte nicht versendet werden.',
    );
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
