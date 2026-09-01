import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideBell,
  LucideBuilding2,
  LucideDatabase,
  LucideDynamicIcon,
  LucideIconInput,
  LucidePackage,
  LucideSmartphone,
  LucideStore,
  LucideUser,
  LucideUsers,
} from '@lucide/angular';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../shared/components/custom-select/custom-select.component';

export interface SettingsNavigationItem {
  readonly path: string;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIconInput;
}

export const SETTINGS_NAVIGATION: readonly SettingsNavigationItem[] = [
  { path: 'account', label: 'Konto', description: 'Profil und Sitzungen', icon: LucideUser },
  {
    path: 'workspace',
    label: 'Workspace',
    description: 'Mandanten und Vorgaben',
    icon: LucideBuilding2,
  },
  { path: 'team', label: 'Team & Rollen', description: 'Zugriffe verwalten', icon: LucideUsers },
  {
    path: 'notifications',
    label: 'Benachrichtigungen',
    description: 'Webhooks und Browser-Push',
    icon: LucideBell,
  },
  {
    path: 'store',
    label: 'Shop & Zahlungen',
    description: 'Zahlungsarten konfigurieren',
    icon: LucideStore,
  },
  {
    path: 'shipping',
    label: 'Versand',
    description: 'Versanddienste anbinden',
    icon: LucidePackage,
  },
  { path: 'app', label: 'App & Geräte', description: 'PWA und Geräte', icon: LucideSmartphone },
  {
    path: 'data',
    label: 'Daten & Protokolle',
    description: 'Prüfprotokoll und Exporte',
    icon: LucideDatabase,
  },
] as const;

@Component({
  selector: 'app-settings-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, LucideDynamicIcon, CustomSelectComponent],
  templateUrl: './settings-shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SettingsShellComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly navigation = SETTINGS_NAVIGATION;
  readonly mobileOptions: readonly SelectOption<string>[] = this.navigation.map((item) => ({
    value: item.path,
    label: item.label,
    description: item.description,
    icon: item.icon,
  }));
  readonly currentPath = signal(this.pathFromUrl(this.router.url));
  readonly currentItem = computed(
    () => this.navigation.find((item) => item.path === this.currentPath()) ?? this.navigation[0],
  );

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => this.currentPath.set(this.pathFromUrl(event.urlAfterRedirects)));
  }

  async onMobileSectionChange(path: string | null): Promise<void> {
    if (!path || !this.navigation.some((item) => item.path === path)) return;
    await this.router.navigate(['/settings', path]);
  }

  private pathFromUrl(url: string): string {
    const child = url.split(/[?#]/u)[0].split('/').filter(Boolean)[1] ?? 'account';
    return child === 'data' ? 'data' : child;
  }
}
