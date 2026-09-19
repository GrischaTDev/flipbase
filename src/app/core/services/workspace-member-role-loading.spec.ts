import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import {
  WorkspaceMemberService,
  isWorkspaceMemberContextResolved,
} from './workspace-member.service';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceMemberService – Rollen-Ladezustand', () => {
  it('ist während des Ladens noch nicht aufgelöst', () => {
    expect(isWorkspaceMemberContextResolved('workspace-1', null, true, false)).toBe(false);
    expect(isWorkspaceMemberContextResolved('workspace-1', 'workspace-1', true, false)).toBe(false);
  });

  it('ist erst nach erfolgreichem Laden genau des aktiven Workspace aufgelöst', () => {
    expect(isWorkspaceMemberContextResolved('workspace-1', 'workspace-1', false, false)).toBe(true);
    expect(isWorkspaceMemberContextResolved('workspace-2', 'workspace-1', false, false)).toBe(false);
  });

  it('gilt im Demo-Modus ohne Serverabfrage als aufgelöst', () => {
    expect(isWorkspaceMemberContextResolved('ws-1', null, false, true)).toBe(true);
  });

  it('ist ohne aktiven Workspace nicht aufgelöst', () => {
    expect(isWorkspaceMemberContextResolved(null, null, false, false)).toBe(false);
  });
});


function createWorkspaceMemberService(
  response: Promise<{
    data: readonly {
      id: string;
      workspace_id: string;
      user_id: string;
      role: string;
      created_at: string;
      profile: { email: string; full_name: string | null };
    }[] | null;
    error: { message: string } | null;
  }>,
) {
  const currentWorkspace = signal({ id: 'workspace-1' });
  const isDemoMode = signal(false);
  const eq = vi.fn(() => response);
  const injector = Injector.create({
    providers: [
      {
        provide: SupabaseService,
        useValue: {
          client: {
            from: () => ({
              select: () => ({ eq }),
            }),
          },
        },
      },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      {
        provide: AuthService,
        useValue: {
          currentUser: () => ({ id: 'user-owner' }),
          userEmail: () => 'owner@flipbase.de',
          userName: () => 'Inhaber',
          isDemoMode,
        },
      },
      { provide: MockDataStoreService, useValue: { isDemoMode } },
      { provide: SyncStatusService, useValue: new SyncStatusService() },
    ],
  });
  const service = runInInjectionContext(injector, () => new WorkspaceMemberService());
  return { service, currentWorkspace, eq };
}

describe('WorkspaceMemberService – echte Ladeauflösung', () => {
  it('bleibt während der Anfrage neutral und löst danach die Inhaberrolle auf', async () => {
    let finish!: (value: {
      data: readonly {
        id: string;
        workspace_id: string;
        user_id: string;
        role: string;
        created_at: string;
        profile: { email: string; full_name: string | null };
      }[];
      error: null;
    }) => void;
    const response = new Promise<{
      data: readonly {
        id: string;
        workspace_id: string;
        user_id: string;
        role: string;
        created_at: string;
        profile: { email: string; full_name: string | null };
      }[];
      error: null;
    }>((resolve) => {
      finish = resolve;
    });
    const { service } = createWorkspaceMemberService(response);

    const loading = service.loadMembers('workspace-1');

    expect(service.currentWorkspaceMembersResolved()).toBe(false);
    expect(service.currentUserRole()).toBeNull();

    finish({
      data: [
        {
          id: 'member-1',
          workspace_id: 'workspace-1',
          user_id: 'user-owner',
          role: 'owner',
          created_at: '2026-09-19T00:00:00Z',
          profile: { email: 'owner@flipbase.de', full_name: 'Inhaber' },
        },
      ],
      error: null,
    });
    await loading;

    expect(service.currentWorkspaceMembersResolved()).toBe(true);
    expect(service.currentUserRole()).toBe('owner');
  });

  it('markiert eine fehlgeschlagene Mitgliederabfrage nicht als erfolgreich aufgelöst', async () => {
    const { service } = createWorkspaceMemberService(
      Promise.resolve({
        data: null,
        error: { message: 'network failed' },
      }),
    );

    await service.loadMembers('workspace-1');

    expect(service.currentWorkspaceMembersResolved()).toBe(false);
    expect(service.currentUserRole()).toBeNull();
  });
});
