import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceMemberService } from './workspace-member.service';
import { WorkspaceService } from './workspace.service';

const workspaceA = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Workspace A',
  min_roi_percent: 30,
  min_profit_amount: 15,
};

const workspaceB = {
  ...workspaceA,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Workspace B',
};

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

interface MemberResponse {
  readonly data: readonly {
    readonly id: string;
    readonly workspace_id: string;
    readonly user_id: string;
    readonly role: string;
    readonly created_at: string;
    readonly profile: { readonly email: string; readonly full_name: string | null };
  }[];
  readonly error: Error | null;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function ownerRow(workspaceId: string): MemberResponse['data'][number] {
  return {
    id: 'member-owner',
    workspace_id: workspaceId,
    user_id: 'user-owner',
    role: 'owner',
    created_at: '2026-09-19T06:00:00.000Z',
    profile: { email: 'owner@flipbase.de', full_name: 'Owner' },
  };
}

function createService() {
  const currentWorkspace = signal(workspaceA);
  const requests = new Map<string, Deferred<MemberResponse>>();

  const from = vi.fn(() => ({
    select: () => ({
      eq: (_column: string, workspaceId: string) => {
        const request = deferred<MemberResponse>();
        requests.set(workspaceId, request);
        return request.promise;
      },
    }),
  }));

  const injector = Injector.create({
    providers: [
      { provide: SupabaseService, useValue: { client: { from } } },
      { provide: WorkspaceService, useValue: { currentWorkspace } },
      { provide: SyncStatusService, useValue: new SyncStatusService() },
      {
        provide: AuthService,
        useValue: {
          currentUser: () => ({ id: 'user-owner' }),
          userEmail: () => 'owner@flipbase.de',
          userName: () => 'Owner',
        },
      },
    ],
  });

  const service = runInInjectionContext(injector, () => new WorkspaceMemberService());
  return { service, currentWorkspace, requests };
}

describe('WorkspaceMemberService Rollen-Ladezustand', () => {
  it('unterscheidet einen noch ladenden Workspace von einer aufgelösten Inhaberrolle', async () => {
    const { service, requests } = createService();

    const load = service.loadMembers(workspaceA.id);

    expect(service.isCurrentWorkspaceLoaded()).toBe(false);
    expect(service.currentUserRole()).toBeNull();

    requests.get(workspaceA.id)?.resolve({ data: [ownerRow(workspaceA.id)], error: null });
    await load;

    expect(service.isCurrentWorkspaceLoaded()).toBe(true);
    expect(service.currentUserRole()).toBe('owner');
  });

  it('lässt eine verspätete Antwort des alten Workspace den neuen Kontext nicht freigeben', async () => {
    const { service, currentWorkspace, requests } = createService();

    const loadA = service.loadMembers(workspaceA.id);
    currentWorkspace.set(workspaceB);
    const loadB = service.loadMembers(workspaceB.id);

    requests.get(workspaceA.id)?.resolve({ data: [ownerRow(workspaceA.id)], error: null });
    await loadA;

    expect(service.isCurrentWorkspaceLoaded()).toBe(false);

    requests.get(workspaceB.id)?.resolve({ data: [ownerRow(workspaceB.id)], error: null });
    await loadB;

    expect(service.isCurrentWorkspaceLoaded()).toBe(true);
    expect(service.currentUserRole()).toBe('owner');
  });
});
