import { describe, expect, it } from 'vitest';
import { isWorkspaceMemberContextResolved } from './workspace-member.service';

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
