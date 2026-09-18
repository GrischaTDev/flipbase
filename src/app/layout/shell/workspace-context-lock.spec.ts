import '@angular/compiler';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { unsavedEntryGuard } from '../../shared/guards/unsaved-entry.guard';
import { blocksWorkspaceActions } from './shell.component';

function snapshot(
  canDeactivate: unknown[] = [],
  firstChild: ActivatedRouteSnapshot | null = null,
): ActivatedRouteSnapshot {
  return {
    routeConfig: { canDeactivate },
    firstChild,
  } as unknown as ActivatedRouteSnapshot;
}

describe('Workspace-Kontext in Erfassungsmasken', () => {
  it('sperrt Workspace-Aktionen auf Seiten mit dem Unsaved-Entry-Guard', () => {
    expect(blocksWorkspaceActions(snapshot([unsavedEntryGuard]))).toBe(true);
  });

  it('erkennt den Guard auch in einer untergeordneten Route', () => {
    expect(blocksWorkspaceActions(snapshot([], snapshot([unsavedEntryGuard])))).toBe(true);
  });

  it('lässt Workspace-Aktionen auf normalen Übersichtsseiten zu', () => {
    expect(blocksWorkspaceActions(snapshot())).toBe(false);
  });
});
