import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { WorkspaceService } from './workspace.service';
import { AuthService } from './auth.service';
import { MockDataStoreService } from './mock-data-store.service';
import { WorkspaceInvite, WorkspaceMember, WorkspaceRole } from '../models/reflip.models';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceMemberService {
  private readonly supabase = inject(SupabaseService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly auth = inject(AuthService);
  private readonly mockStore = inject(MockDataStoreService);

  readonly members = signal<WorkspaceMember[]>([
    {
      id: 'wm-1',
      workspace_id: 'ws-1',
      user_id: 'user-owner',
      email: 'alex.reflip@example.com',
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
  ]);

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

  readonly currentUserRole = computed<WorkspaceRole>(() => {
    const currentEmail = this.auth.userEmail();
    const member = this.members().find((m) => m.email.toLowerCase() === currentEmail?.toLowerCase());
    return member?.role || 'owner';
  });

  constructor() {
    effect(() => {
      const ws = this.workspaceService.currentWorkspace();
      if (ws) {
        this.loadMembers(ws.id);
      }
    });
  }

  async loadMembers(workspaceId: string): Promise<void> {
    if (this.mockStore.isDemoMode()) return;

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('workspace_members')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (!error && data && data.length > 0) {
        this.members.set(data as WorkspaceMember[]);
      }
    } catch {
      // ignore
    } finally {
      this.isLoading.set(false);
    }
  }

  async inviteMember(email: string, role: WorkspaceRole): Promise<{ error: Error | null }> {
    const ws = this.workspaceService.currentWorkspace();
    const cleanEmail = email.trim().toLowerCase();

    if (this.members().some((m) => m.email.toLowerCase() === cleanEmail)) {
      return { error: new Error('Dieses Mitglied ist bereits im Workspace registriert.') };
    }

    if (this.invites().some((i) => i.email.toLowerCase() === cleanEmail && i.status === 'pending')) {
      return { error: new Error('Für diese E-Mail-Adresse liegt bereits eine offene Einladung vor.') };
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

    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client.from('workspace_invites').insert({
          workspace_id: ws?.id,
          email: cleanEmail,
          role,
          status: 'pending',
        });
      } catch {
        // ignore
      }
    }

    return { error: null };
  }

  async updateMemberRole(memberId: string, newRole: WorkspaceRole): Promise<{ error: Error | null }> {
    this.members.update((list) =>
      list.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );

    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client
          .from('workspace_members')
          .update({ role: newRole })
          .eq('id', memberId);
      } catch {
        // ignore
      }
    }

    return { error: null };
  }

  async removeMember(memberId: string): Promise<{ error: Error | null }> {
    this.members.update((list) => list.filter((m) => m.id !== memberId));

    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client.from('workspace_members').delete().eq('id', memberId);
      } catch {
        // ignore
      }
    }

    return { error: null };
  }

  async cancelInvite(inviteId: string): Promise<{ error: Error | null }> {
    this.invites.update((list) => list.filter((i) => i.id !== inviteId));

    if (!this.mockStore.isDemoMode()) {
      try {
        await this.supabase.client.from('workspace_invites').delete().eq('id', inviteId);
      } catch {
        // ignore
      }
    }

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
          class: 'bg-rf-subtle text-rf-text-muted border-rf-border',
          description: 'Ansicht von Daten ohne Bearbeitungsrechte',
        };
    }
  }
}
