import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { BottomNavComponent } from '../bottom-nav/bottom-nav.component';
import { WorkspaceModalComponent } from '../../shared/components/workspace-modal/workspace-modal.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { AuthService } from '../../core/services/auth.service';
import { MockDataStoreService } from '../../core/services/mock-data-store.service';
import { unsavedEntryGuard } from '../../shared/guards/unsaved-entry.guard';

export function blocksWorkspaceActions(route: ActivatedRouteSnapshot | null): boolean {
  let current = route;

  while (current) {
    if (current.routeConfig?.canDeactivate?.some((guard) => guard === unsavedEntryGuard)) {
      return true;
    }
    current = current.firstChild;
  }

  return false;
}

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    HeaderComponent,
    SidebarComponent,
    BottomNavComponent,
    WorkspaceModalComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './shell.component.html',
  host: { class: 'fb-admin block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  private readonly mockStore = inject(MockDataStoreService);
  private readonly router = inject(Router);
  private readonly navigationEnd = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    ),
    { initialValue: null },
  );

  readonly isSidebarOpen = signal<boolean>(false);
  readonly isCreateWorkspaceModalOpen = signal<boolean>(false);
  readonly workspaceActionsBlocked = computed(() => {
    this.navigationEnd();
    return blocksWorkspaceActions(this.router.routerState.snapshot.root);
  });

  reloadDemoData(): void {
    this.mockStore.resetToDemoShowcase();
    window.location.reload();
  }

  toggleSidebar(): void {
    this.isSidebarOpen.update((v) => !v);
  }

  closeSidebar(): void {
    this.isSidebarOpen.set(false);
  }

  openCreateWorkspace(): void {
    if (this.workspaceActionsBlocked()) return;
    this.isCreateWorkspaceModalOpen.set(true);
  }

  closeCreateWorkspace(): void {
    this.isCreateWorkspaceModalOpen.set(false);
  }

  async onWorkspaceCreated(): Promise<void> {
    this.closeCreateWorkspace();
    await this.router.navigate(['/dashboard']);
  }
}
