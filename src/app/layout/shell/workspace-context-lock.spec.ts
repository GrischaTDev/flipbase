import '@angular/compiler';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { routeLocksWorkspaceContext } from '../../core/services/workspace-context-lock.service';

function snapshot(
  options: {
    canDeactivate?: unknown[];
    workspaceContextLocked?: boolean;
    firstChild?: ActivatedRouteSnapshot | null;
  } = {},
): ActivatedRouteSnapshot {
  return {
    data: options.workspaceContextLocked ? { workspaceContextLocked: true } : {},
    routeConfig: { canDeactivate: options.canDeactivate ?? [] },
    firstChild: options.firstChild ?? null,
  } as unknown as ActivatedRouteSnapshot;
}

describe('Workspace-Kontext in Erfassungsmasken', () => {
  it('sperrt Workspace-Aktionen auf Seiten mit dem Unsaved-Entry-Guard', () => {
    expect(routeLocksWorkspaceContext(snapshot({ canDeactivate: [() => true] }))).toBe(true);
  });

  it('erkennt den Guard auch in einer untergeordneten Route', () => {
    expect(
      routeLocksWorkspaceContext(
        snapshot({ firstChild: snapshot({ workspaceContextLocked: true }) }),
      ),
    ).toBe(true);
  });

  it('lässt Workspace-Aktionen auf normalen Übersichtsseiten zu', () => {
    expect(routeLocksWorkspaceContext(snapshot())).toBe(false);
  });
});
