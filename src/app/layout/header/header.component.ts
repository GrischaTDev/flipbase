import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LucideAngularModule, Layers, Globe, LogOut, User as UserIcon, Plus, Menu, Sun, Moon } from 'lucide-angular';
import { AuthService } from '../../core/services/auth.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { ThemeService } from '../../core/services/theme.service';
import { Workspace } from '../../core/models/reflip.models';

@Component({
  selector: 'app-header',
  imports: [RouterLink, TranslatePipe, LucideAngularModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  readonly auth = inject(AuthService);
  readonly workspaceService = inject(WorkspaceService);
  readonly themeService = inject(ThemeService);
  private readonly translate = inject(TranslateService);

  readonly toggleSidebar = output<void>();
  readonly openCreateWorkspace = output<void>();

  readonly isWorkspaceDropdownOpen = signal<boolean>(false);
  readonly isUserDropdownOpen = signal<boolean>(false);

  // Icons
  readonly LayersIcon = Layers;
  readonly GlobeIcon = Globe;
  readonly LogOutIcon = LogOut;
  readonly UserIcon = UserIcon;
  readonly PlusIcon = Plus;
  readonly MenuIcon = Menu;
  readonly SunIcon = Sun;
  readonly MoonIcon = Moon;

  currentLanguage = signal<string>('de');

  toggleWorkspaceDropdown(): void {
    this.isWorkspaceDropdownOpen.update((v) => !v);
    this.isUserDropdownOpen.set(false);
  }

  toggleUserDropdown(): void {
    this.isUserDropdownOpen.update((v) => !v);
    this.isWorkspaceDropdownOpen.set(false);
  }

  selectWorkspace(ws: Workspace): void {
    this.workspaceService.setCurrentWorkspace(ws);
    this.isWorkspaceDropdownOpen.set(false);
  }

  switchLanguage(lang: string): void {
    this.currentLanguage.set(lang);
    this.translate.use(lang);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  onSignOut(): void {
    this.auth.signOut();
  }
}
