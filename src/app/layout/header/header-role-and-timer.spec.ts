import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { WorkspaceMember, WorkspaceRole } from '../../core/models/flipbase.models';
import { resolveCurrentUserRole } from '../../core/services/workspace-member.service';
import { formatSiteOnlineDuration, visibleHeaderRole } from './header.component';

function member(email: string, role: WorkspaceRole): Pick<WorkspaceMember, 'email' | 'role'> {
  return { email, role };
}

describe('Kopfzeile – Rolle und Sitzungszeit', () => {
  it('zeigt den Rollen-Badge nur für echte Administratoren', () => {
    expect(visibleHeaderRole('admin')).toBe('admin');
    expect(visibleHeaderRole('owner')).toBeNull();
    expect(visibleHeaderRole('member')).toBeNull();
    expect(visibleHeaderRole(null)).toBeNull();
    expect(
      visibleHeaderRole(
        resolveCurrentUserRole([member('admin@flipbase.de', 'admin')], 'ADMIN@FLIPBASE.DE', false),
      ),
    ).toBe('admin');
  });

  it('übernimmt bei einem unbekannten angemeldeten Konto nicht fälschlich die Inhaberrolle', () => {
    expect(
      resolveCurrentUserRole(
        [member('anderes-konto@flipbase.de', 'owner')],
        'neues-konto@flipbase.de',
        false,
      ),
    ).toBeNull();
  });

  it('behält den bewusst verwendeten Demo-Workspace als Inhaber', () => {
    expect(resolveCurrentUserRole([], 'demo@flipbase.app', true)).toBe('owner');
  });

  it('formatiert die Dauer der aktuellen App-Sitzung als Stunden, Minuten und Sekunden', () => {
    expect(formatSiteOnlineDuration(0)).toBe('00:00:00');
    expect(formatSiteOnlineDuration(65)).toBe('00:01:05');
    expect(formatSiteOnlineDuration(3661)).toBe('01:01:01');
    expect(formatSiteOnlineDuration(-10)).toBe('00:00:00');
  });
});
