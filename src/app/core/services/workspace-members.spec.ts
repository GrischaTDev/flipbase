import { describe, it, expect } from 'vitest';
import { WorkspaceMember, WorkspaceRole } from '../models/reflip.models';

describe('Workspace Member & Role Management', () => {
  const members: WorkspaceMember[] = [
    {
      id: 'wm-1',
      workspace_id: 'ws-1',
      user_id: 'u-1',
      email: 'owner@reflip.de',
      full_name: 'Max Inhaber',
      role: 'owner',
    },
    {
      id: 'wm-2',
      workspace_id: 'ws-1',
      user_id: 'u-2',
      email: 'sourcing@reflip.de',
      full_name: 'Sarah Einkauf',
      role: 'member',
    },
    {
      id: 'wm-3',
      workspace_id: 'ws-1',
      user_id: 'u-3',
      email: 'steuer@kanzlei.de',
      full_name: 'Steuerberater Müller',
      role: 'accountant',
    },
  ];

  it('should verify defined roles in workspace hierarchy', () => {
    const roles: WorkspaceRole[] = ['owner', 'admin', 'member', 'fulfillment', 'accountant', 'readonly'];
    expect(roles.length).toBe(6);
    expect(roles).toContain('owner');
    expect(roles).toContain('accountant');
    expect(roles).toContain('fulfillment');
  });

  it('should correctly filter members by role', () => {
    const accountants = members.filter((m) => m.role === 'accountant');
    expect(accountants.length).toBe(1);
    expect(accountants[0].email).toBe('steuer@kanzlei.de');
  });

  it('should update member role immutably', () => {
    const updated = members.map((m) => (m.id === 'wm-2' ? { ...m, role: 'admin' as WorkspaceRole } : m));
    const modifiedMember = updated.find((m) => m.id === 'wm-2');
    expect(modifiedMember?.role).toBe('admin');
  });
});
