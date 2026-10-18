import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PageLayoutService, pageContentMaxWidth } from '../../core/services/page-layout.service';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { BottomNavComponent } from '../bottom-nav/bottom-nav.component';
import { WorkspaceModalComponent } from '../../shared/components/workspace-modal/workspace-modal.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { WorkspaceContextLockService } from '../../core/services/workspace-context-lock.service';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
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
  private readonly workspaceContext = inject(WorkspaceContextLockService);

  private readonly pageLayout = inject(PageLayoutService);
  readonly contentMaxWidth = computed(() => pageContentMaxWidth(this.pageLayout.width()));

  readonly isSidebarOpen = signal<boolean>(false);
  readonly isCreateWorkspaceModalOpen = signal<boolean>(false);
  readonly workspaceActionsBlocked = this.workspaceContext.locked;

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

  onWorkspaceCreated(): void {
    this.closeCreateWorkspace();
  }
}
