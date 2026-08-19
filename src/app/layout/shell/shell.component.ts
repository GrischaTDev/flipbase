import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { BottomNavComponent } from '../bottom-nav/bottom-nav.component';
import { WorkspaceModalComponent } from '../../shared/components/workspace-modal/workspace-modal.component';
import { AuthService } from '../../core/services/auth.service';
import { MockDataStoreService } from '../../core/services/mock-data-store.service';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    HeaderComponent,
    SidebarComponent,
    BottomNavComponent,
    WorkspaceModalComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  private readonly mockStore = inject(MockDataStoreService);

  readonly isSidebarOpen = signal<boolean>(false);
  readonly isCreateWorkspaceModalOpen = signal<boolean>(false);

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
    this.isCreateWorkspaceModalOpen.set(true);
  }

  closeCreateWorkspace(): void {
    this.isCreateWorkspaceModalOpen.set(false);
  }
}
