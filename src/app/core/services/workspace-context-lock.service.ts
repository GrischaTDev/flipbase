import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

export function routeLocksWorkspaceContext(route: ActivatedRouteSnapshot | null): boolean {
  let current = route;

  while (current) {
    if (
      current.data?.['workspaceContextLocked'] === true ||
      (current.routeConfig?.canDeactivate?.length ?? 0) > 0
    ) {
      return true;
    }
    current = current.firstChild;
  }

  return false;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceContextLockService {
  private readonly router = inject(Router, { optional: true });
  private readonly manualLockCount = signal(0);
  private readonly routeLocked = signal(false);

  readonly locked = computed(() => this.routeLocked() || this.manualLockCount() > 0);

  constructor() {
    this.refreshRouteLock();
    const events = this.router?.events;
    if (!events) return;
    events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.refreshRouteLock());
  }

  acquire(): () => void {
    this.manualLockCount.update((count) => count + 1);
    let released = false;

    return () => {
      if (released) return;
      released = true;
      this.manualLockCount.update((count) => Math.max(0, count - 1));
    };
  }

  private refreshRouteLock(): void {
    const root = this.router?.routerState?.snapshot?.root ?? null;
    this.routeLocked.set(routeLocksWorkspaceContext(root));
  }
}
