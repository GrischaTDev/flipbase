import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceService } from '../../../core/services/workspace.service';
import {
  AiConnectionService,
  type AiConnectionAccount,
} from '../../settings/services/ai-connection.service';
import { AiConnectionConsentComponent } from './ai-connection-consent.component';

describe('AI consent boundaries', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const service = {
      authorizationDetails: vi
        .fn()
        .mockResolvedValue({ data: { client: { name: 'Eigene KI' } }, error: null }),
      accounts: vi
        .fn<(_id: string) => Promise<readonly AiConnectionAccount[]>>()
        .mockResolvedValue([]),
      approve: vi.fn().mockResolvedValue(undefined),
      deny: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AiConnectionService, useValue: service },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({ authorization_id: 'own-request' }) },
          },
        },
        {
          provide: WorkspaceService,
          useValue: { currentWorkspace: signal(null), workspaces: signal([]) },
        },
      ],
    });
    const component = TestBed.runInInjectionContext(() => new AiConnectionConsentComponent());
    return { component, service };
  }
  it('defaults to application-wide read access and works without a Vinted account', async () => {
    const { component, service } = setup();
    await vi.waitFor(() => expect(component.busy()).toBe(false));
    component.form.controls.workspace.setValue('workspace-one');
    await vi.waitFor(() => expect(component.loadingAccounts()).toBe(false));
    expect(component.form.controls.mode.value).toBe('read');
    await component.decide(true);
    expect(service.approve).toHaveBeenCalledExactlyOnceWith(
      'own-request',
      'workspace-one',
      'read',
      [],
    );
  });
  it('workspace switches drop selected accounts and ignore older account responses', async () => {
    const { component, service } = setup();
    await vi.waitFor(() => expect(component.busy()).toBe(false));
    let finishOld!: (accounts: readonly AiConnectionAccount[]) => void;
    service.accounts.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    component.form.controls.workspace.setValue('old-workspace');
    component.selectAccount('old-account', true);
    component.form.controls.workspace.setValue('new-workspace');
    await vi.waitFor(() => expect(component.loadingAccounts()).toBe(false));
    finishOld([{ id: 'old-account', display_name: 'Altes Konto' }]);
    await Promise.resolve();
    expect(component.accounts()).toEqual([]);
    expect(component.selectedAccounts()).toEqual([]);
    component.form.controls.mode.setValue('edit');
    await component.decide(true);
    expect(service.approve).toHaveBeenCalledExactlyOnceWith(
      'own-request',
      'new-workspace',
      'edit',
      [],
    );
  });
  it('denying consent never creates or replaces an existing grant', async () => {
    const { component, service } = setup();
    await vi.waitFor(() => expect(component.busy()).toBe(false));
    await component.decide(false);
    expect(service.deny).toHaveBeenCalledExactlyOnceWith('own-request');
    expect(service.approve).not.toHaveBeenCalled();
  });
});
