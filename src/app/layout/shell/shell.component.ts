import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { BottomNavComponent } from '../bottom-nav/bottom-nav.component';
import { WorkspaceModalComponent } from '../../shared/components/workspace-modal/workspace-modal.component';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
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
  readonly isSidebarOpen = signal<boolean>(false);
  readonly isCreateWorkspaceModalOpen = signal<boolean>(false);

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
