import '@angular/compiler';
import { signal, ɵresolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceMemberService } from '../../../core/services/workspace-member.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { CustomSelectComponent } from '../../../shared/components/custom-select/custom-select.component';
import { AccountSettingsComponent } from './account-settings/account-settings.component';
import { TeamSettingsComponent } from './team-settings/team-settings.component';
import { WorkspaceSettingsComponent } from './workspace-settings/workspace-settings.component';

describe('Einstellungsseiten – gerenderte Aktionen', () => {
  beforeAll(async () => {
    await ɵresolveComponentResources((url) => {
      const folder = url.replace('.component.html', '');
      const resource = url.includes('custom-select.component')
        ? `../../../shared/components/custom-select/${url}`
        : `./${folder}/${url}`;
      return readFile(new URL(resource, import.meta.url), 'utf8');
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  beforeEach(() => {
    const metadata = (
      CustomSelectComponent as unknown as {
        ɵcmp: { inputs: Record<string, unknown>; declaredInputs: Record<string, string> };
      }
    ).ɵcmp;
    metadata.inputs = {
      ...metadata.inputs,
      options: ['options', 1, null],
      value: ['value', 1, null],
      ariaLabel: ['ariaLabel', 1, null],
    };
    metadata.declaredInputs = {
      ...metadata.declaredInputs,
      options: 'options',
      value: 'value',
      ariaLabel: 'ariaLabel',
    };
  });

  it('rendert das Profilformular und speichert dessen Wert', async () => {
    const auth = {
      profile: signal({ full_name: 'Ada Lovelace' }),
      currentUser: signal({ email: 'ada@flipbase.de' }),
      aktualisiereProfil: vi.fn(async () => ({ error: null, reportedBySyncStatus: false })),
      abmeldenUeberall: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [AccountSettingsComponent],
      providers: [
        ToastService,
        { provide: AuthService, useValue: auth },
        { provide: ConfirmDialogService, useValue: { frage: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Mein Konto');
    fixture.componentInstance.profileForm.controls.fullName.setValue('Grace Hopper');
    await fixture.componentInstance.onSaveProfile();
    expect(auth.aktualisiereProfil).toHaveBeenCalledWith('Grace Hopper');
  });

  it('rendert offene Einladungen mit der zugehörigen Rolleninformation', async () => {
    const memberService = {
      members: signal([]),
      invites: signal([{ id: 'invite-1', email: 'team@flipbase.de', role: 'accountant' }]),
      getRoleBadge: vi.fn(() => ({
        label: 'Steuerberater / DATEV',
        description: 'Nur-Lesen auf Finanzen',
      })),
      inviteMember: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
      cancelInvite: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [TeamSettingsComponent],
      providers: [
        ToastService,
        { provide: WorkspaceMemberService, useValue: memberService },
        { provide: ConfirmDialogService, useValue: { frage: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(TeamSettingsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Steuerberater / DATEV');
  });

  it('übergibt den ausgewählten Workspace an den Aufbewahrungsablauf', async () => {
    const router = { navigate: vi.fn(async () => true) };
    await TestBed.configureTestingModule({
      imports: [WorkspaceSettingsComponent],
      providers: [
        ToastService,
        { provide: Router, useValue: router },
        {
          provide: WorkspaceService,
          useValue: {
            currentWorkspace: signal(null),
            workspaces: signal([]),
            createWorkspace: vi.fn(),
            updateWorkspaceSettings: vi.fn(),
            switchWorkspace: vi.fn(),
          },
        },
      ],
    }).compileComponents();
    const fixture: ComponentFixture<WorkspaceSettingsComponent> = TestBed.createComponent(
      WorkspaceSettingsComponent,
    );
    fixture.detectChanges();
    await fixture.componentInstance.onDeleteWorkspace('workspace-2');
    expect(router.navigate).toHaveBeenCalledWith(['/settings/data'], {
      queryParams: { retentionWorkspace: 'workspace-2' },
      fragment: 'retention-heading',
    });
  });
});
