import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../../core/services/supabase.service';
import { PlatformUserService } from './platform-user.service';

describe('PlatformUserService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('verknuepft die Datenbankansicht mit dem Oberflaechenmodell', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          user_id: 'user-1',
          full_name: 'Anna Beispiel',
          email: 'anna@example.test',
          workspace_id: 'workspace-1',
          workspace_name: 'Anna Handel',
          application_status: 'accepted',
          invitation_status: 'sent',
          registered_at: '2026-09-20T10:00:00.000Z',
          license_status: 'active',
          beta_starts_at: '2026-09-20T10:00:00.000Z',
          beta_ends_at: '2026-11-19T10:00:00.000Z',
        },
      ],
      error: null,
    });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });

    const users = await TestBed.inject(PlatformUserService).list();

    expect(rpc).toHaveBeenCalledWith('list_platform_users');
    expect(users).toEqual([
      {
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
      },
    ]);
  });

  it('gibt Ladefehler an die Verwaltungsseite weiter', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'keine Rechte' } });
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { rpc } } }],
    });

    await expect(TestBed.inject(PlatformUserService).list()).rejects.toThrow('keine Rechte');
  });
});
