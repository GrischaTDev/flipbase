import '@angular/compiler';
import { ɵresolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { glob, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BetaApprovalDialogComponent } from './beta-approval-dialog.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

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
  authUserId: null,
  invitationStatus: 'not_sent' as const,
  invitationSentAt: null,
  invitationLastError: null,
  registeredAt: null,
};

beforeAll(async () => {
  await ɵresolveComponentResources(async (url) => {
    const fileName = url.replace(/^\.\//u, '');
    const matches: string[] = [];
    for await (const match of glob(`src/app/**/${fileName}`)) matches.push(match);
    if (matches.length !== 1) throw new Error(`Test-Ressource ${url} ist nicht eindeutig.`);
    return readFile(matches[0], 'utf8');
  });
  registerSignalInputs(BetaApprovalDialogComponent, ['application', 'processing']);
  registerSignalInputs(ModalShellComponent, ['title', 'subtitle', 'icon', 'iconTone', 'size']);
  registerSignalInputs(NumberInputComponent, ['id', 'min', 'max', 'step', 'unit', 'ariaLabel']);
  registerSignalInputs(ButtonComponent, ['variant', 'loading', 'disabled']);
});

afterAll(() => {
  for (const [component, snapshot] of inputMetadataSnapshots) {
    const metadata = (component as { ɵcmp: AngularInputMetadata }).ɵcmp;
    metadata.inputs = snapshot.inputs;
    metadata.declaredInputs = snapshot.declaredInputs;
  }
});

describe('BetaApprovalDialogComponent', () => {
  it('zeigt Bewerberdaten und startet mit 60 Tagen', async () => {
    const fixture = TestBed.createComponent(BetaApprovalDialogComponent);
    fixture.componentRef.setInput('application', application);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Anna Beispiel');
    expect(fixture.nativeElement.textContent).toContain('anna@example.test');
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="number"]');
    expect(input.value).toBe('60');
  });

  it('gibt nur eine gueltige ganze Laufzeit frei', () => {
    const fixture = TestBed.createComponent(BetaApprovalDialogComponent);
    fixture.componentRef.setInput('application', application);
    fixture.detectChanges();
    const approved = vi.fn();
    fixture.componentInstance.approved.subscribe(approved);

    fixture.componentInstance.form.controls.grantedDays.setValue(0);
    fixture.componentInstance.approve();
    fixture.componentInstance.form.controls.grantedDays.setValue(3651);
    fixture.componentInstance.approve();
    fixture.componentInstance.form.controls.grantedDays.setValue(90.5);
    fixture.componentInstance.approve();
    expect(approved).not.toHaveBeenCalled();

    fixture.componentInstance.form.controls.grantedDays.setValue(90);
    fixture.componentInstance.approve();
    expect(approved).toHaveBeenCalledWith(90);
  });
});
