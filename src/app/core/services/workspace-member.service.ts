import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import { SyncStatusService } from './sync-status.service';
import { WorkspaceInvite, WorkspaceMember, WorkspaceRole } from '../models/flipbase.models';
import { Tables } from '../models/supabase.types';

type WorkspaceMemberQueryRow = Pick<
  Tables<'workspace_members'>,
  'id' | 'workspace_id' | 'user_id' | 'role' | 'created_at'
> & {
  profile: Pick<Tables<'profiles'>, 'email' | 'full_name'> | null;
};

type WorkspaceMemberRoleEntry = Pick<WorkspaceMember, 'role'> &
  Partial<Pick<WorkspaceMember, 'user_id' | 'email'>>;

export function resolveCurrentUserRole(
  members: readonly WorkspaceMemberRoleEntry[],
  currentUserId: string | null | undefined,
  currentEmail: string | null | undefined,
  isDemoMode: boolean,
): WorkspaceRole | null {
  if (isDemoMode) return 'owner';

  const normalizedUserId = currentUserId?.trim();
  const memberById = normalizedUserId
    ? members.find((member) => member.user_id === normalizedUserId)
    : undefined;
  if (memberById) return memberById.role;

  const normalizedEmail = currentEmail?.trim().toLowerCase();
  if (!normalizedEmail) return null;

  return (
    members.find((member) => (member.email ?? '').trim().toLowerCase() === normalizedEmail)?.role ??
    null
  );
}

@Injectable({
  providedIn: 'root',
})
export class WorkspaceMemberService {
  private readonly supabase = inject(SupabaseService);
  private readonly syncStatus = inject(SyncStatusService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly mockStore = inject(MockDataStoreService);

  private readonly demoMembers: WorkspaceMember[] = [
    {
      id: 'wm-1',
      workspace_id: 'ws-1',
      user_id: 'user-owner',
      email: 'alex.flipbase@example.com',
      full_name: 'Alex (Inhaber)',
      role: 'owner',
      joined_at: '2026-01-01T10:00:00Z',
    },
    {
      id: 'wm-2',
      workspace_id: 'ws-1',
      user_id: 'user-sourcing',
      email: 'sarah.sourcing@example.com',
      full_name: 'Sarah (Sourcing & Einkauf)',
      role: 'member',
      joined_at: '2026-01-15T14:30:00Z',
    },
    {
      id: 'wm-3',
      workspace_id: 'ws-1',
      user_id: 'user-tax',
      email: 'kanzlei.steuer@datev-berater.de',
      full_name: 'StB Müller (DATEV / Buchhaltung)',
      role: 'accountant',
      joined_at: '2026-02-01T09:00:00Z',
    },
  ];

  readonly members = signal<WorkspaceMember[]>(this.mockStore.isDemoMode() ? this.demoMembers : []);

  readonly invites = signal<WorkspaceInvite[]>([
    {
      id: 'inv-1',
      workspace_id: 'ws-1',
      email: 'tim.versand@logistik.de',
      role: 'fulfillment',
      invited_by_name: 'Alex (Inhaber)',
      status: 'pending',
      created_at: new Date().toISOString(),
    },
  ]);

  readonly isLoading = signal<boolean>(false);
  readonly loadedWorkspaceId = signal<string | null>(null);
  private membersLoadVersion = 0;

  readonly isCurrentWorkspaceLoaded = computed(() => {
    if (this.mockStore.isDemoMode()) return true;
    const workspaceId = this.workspaceService.currentWorkspace()?.id ?? null;
    return workspaceId !== null && this.loadedWorkspaceId() === workspaceId;
  });

  readonly currentUserRole = computed<WorkspaceRole | null>(() =>
    resolveCurrentUserRole(
      this.members(),
      this.auth.currentUser()?.id,
      this.auth.userEmail(),
      this.auth.isDemoMode(),
    ),
  );

  constructor() {
    // Hinweis: effect() benoetigt einen ChangeDetectionScheduler. Die
    // Service-Tests erzeugen die Dienste noch mit einem blanken Injector, in
    // dem dieser fehlt. Bis die Testumgebung auf TestBed mit jsdom
    // umgestellt ist, bleibt dieser Schutz noetig - ohne ihn schlagen 39 Tests
    // fehl. Danach ersatzlos entfernen.
    try {
      effect(() => {
        const ws = this.workspaceService.currentWorkspace();
        if (ws) {
          void this.loadMembers(ws.id);
        } else {
          this.membersLoadVersion++;
          this.members.set([]);
          this.loadedWorkspaceId.set(null);
          this.isLoading.set(false);
        }
      });
    } catch {
      // nur Testumgebung ohne Scheduler
    }
  }

  async loadMembers(workspaceId: string): Promise<void> {
    if (this.mockStore.isDemoMode()) {
      this.loadedWorkspaceId.set(workspaceId);
      return;
    }

    const loadVersion = ++this.membersLoadVersion;
    if (this.workspaceService.currentWorkspace()?.id === workspaceId) {
      this.loadedWorkspaceId.set(null);
    }
    this.members.set([]);
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('workspace_members')
        .select(
          `
          id,
          workspace_id,
          user_id,
          role,
          created_at,
          profile:profiles(email, full_name)
        `,
        )
        .eq('workspace_id', workspaceId);

      if (loadVersion !== this.membersLoadVersion) return;

      if (error) {
        this.syncStatus.melde('Laden der Workspace-Mitglieder', error);
      } else {
        const mapped: WorkspaceMember[] = (data as WorkspaceMemberQueryRow[]).map((m) => ({
          id: m.id,
          workspace_id: m.workspace_id,
          user_id: m.user_id,
          role: m.role as WorkspaceRole,
          email: m.profile?.email || '',
          full_name: m.profile?.full_name || null,
          created_at: m.created_at,
          joined_at: m.created_at,
        }));
        this.members.set(mapped);
      }
    } catch (err) {
      if (loadVersion === this.membersLoadVersion) {
        this.syncStatus.melde('Laden der Workspace-Mitglieder', err);
      }
    } finally {
      if (loadVersion === this.membersLoadVersion) {
        this.isLoading.set(false);
        if (this.workspaceService.currentWorkspace()?.id === workspaceId) {
          this.loadedWorkspaceId.set(workspaceId);
        }
      }
    }
  }

  async inviteMember(email: string, role: WorkspaceRole): Promise<{ error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    const cleanEmail = email.trim().toLowerCase();

    if (this.members().some((m) => (m.email ?? '').toLowerCase() === cleanEmail)) {
      return { error: new Error('Dieses Mitglied ist bereits im Workspace registriert.') };
    }

    if (
      this.invites().some(
        (i) => (i.email ?? '').toLowerCase() === cleanEmail && i.status === 'pending',
      )
    ) {
      return {
        error: new Error('Für diese E-Mail-Adresse liegt bereits eine offene Einladung vor.'),
      };
    }

    const newInvite: WorkspaceInvite = {
      id: 'inv-' + Math.random().toString(36).substring(2, 9),
      workspace_id: ws?.id || 'ws-1',
      email: cleanEmail,
      role,
      invited_by_name: this.auth.userName() || 'Inhaber',
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    this.invites.update((list) => [newInvite, ...list]);
    return { error: null };
  }

  async updateMemberRole(
    memberId: string,
    newRole: WorkspaceRole,
  ): Promise<{ error: Error | null }> {
    this.members.update((list) =>
      list.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)),
    );

    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client
          .from('workspace_members')
          .update({ role: newRole })
          .eq('id', memberId);

        if (error) {
          return { error: this.syncStatus.melde('Aktualisieren der Mitgliederrolle', error) };
        }
      } catch (err: unknown) {
        return { error: this.syncStatus.melde('Aktualisieren der Rolle', err) };
      }
    }

    return { error: null };
  }

  async removeMember(memberId: string): Promise<{ error: Error | null }> {
    this.members.update((list) => list.filter((m) => m.id !== memberId));

    if (!this.mockStore.isDemoMode()) {
      try {
        const { error } = await this.supabase.client
          .from('workspace_members')
          .delete()
          .eq('id', memberId);
        if (error) {
          return { error: this.syncStatus.melde('Entfernen des Mitglieds', error) };
        }
      } catch (err: unknown) {
        return { error: this.syncStatus.melde('Entfernen des Mitglieds', err) };
      }
    }

    return { error: null };
  }

  async cancelInvite(inviteId: string): Promise<{ error: Error | null }> {
    this.invites.update((list) => list.filter((i) => i.id !== inviteId));
    return { error: null };
  }

  getRoleBadge(role: WorkspaceRole): { label: string; class: string; description: string } {
    switch (role) {
      case 'owner':
        return {
          label: 'Inhaber',
          class: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
          description: 'Voller Zugriff auf Workspace, Finanzen & Abrechnung',
        };
      case 'admin':
        return {
          label: 'Administrator',
          class: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
          description: 'Verwaltung von Einkäufen, Inventar & Team',
        };
      case 'member':
        return {
          label: 'Sourcing & Einkauf',
          class: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
          description: 'Erfassen von Einkäufen, Inventar & Inseraten',
        };
      case 'fulfillment':
        return {
          label: 'Packstation & Logistik',
          class: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
          description: 'Verkaufte Artikel, Paketmarken & Sendungsnummern',
        };
      case 'accountant':
        return {
          label: 'Steuerberater / DATEV',
          class: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          description: 'Nur-Lese-Zugriff auf Steuerdaten, EÜR & DATEV-Export',
        };
      case 'readonly':
        return {
          label: 'Nur-Lesen',
          class: 'bg-fb-subtle text-fb-text-muted border-fb-border',
          description: 'Ansicht von Daten ohne Bearbeitungsrechte',
        };
    }
  }
}
