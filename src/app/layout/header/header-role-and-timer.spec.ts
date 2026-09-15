import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { WorkspaceMember, WorkspaceRole } from '../../core/models/flipbase.models';
import { resolveCurrentUserRole } from '../../core/services/workspace-member.service';
import { visibleHeaderRole } from './header.component';

function member(
  email: string,
  role: WorkspaceRole,
  userId?: string,
): Pick<WorkspaceMember, 'email' | 'role'> & Partial<Pick<WorkspaceMember, 'user_id'>> {
  return userId ? { email, role, user_id: userId } : { email, role };
}

describe('Kopfzeile – Rollenanzeige', () => {
  it('zeigt den Badge ausschließlich für Plattform-Administratoren', () => {
    expect(visibleHeaderRole(false)).toBeNull();
    expect(visibleHeaderRole(true)).toBe('admin');
  });

  it('übernimmt bei einem unbekannten angemeldeten Konto nicht fälschlich die Inhaberrolle', () => {
    expect(
      resolveCurrentUserRole(
        [member('anderes-konto@flipbase.de', 'owner')],
        'new-user-id',
        'neues-konto@flipbase.de',
        false,
      ),
    ).toBeNull();
  });

  it('behält den bewusst verwendeten Demo-Workspace als Inhaber', () => {
    expect(resolveCurrentUserRole([], null, 'demo@flipbase.app', true)).toBe('owner');
  });

  it('ermittelt die Rolle auch ohne Profil-E-Mail über die Benutzer-ID', () => {
    expect(resolveCurrentUserRole([member('', 'admin', 'user-42')], 'user-42', null, false)).toBe(
      'admin',
    );
  });
});
