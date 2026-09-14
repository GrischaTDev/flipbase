import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideActivity,
  LucideDynamicIcon,
  LucideIconInput,
  LucideListChecks,
  LucideTags,
} from '@lucide/angular';
import { filter } from 'rxjs';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../shared/components/custom-select/custom-select.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

export interface VintedBotNavigationItem {
  readonly path: string;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIconInput;
}

/** Die Bereiche des Vinted Bots, in der Reihenfolge des Seitenmenues. */
export const VINTED_BOT_NAVIGATION: readonly VintedBotNavigationItem[] = [
  {
    path: 'queries',
    label: 'Markenfilter',
    description: 'Zentrale Marken des Bots',
    icon: LucideListChecks,
  },
  {
    path: 'operation',
    label: 'Botbetrieb',
    description: 'Anfragen und Fehler',
    icon: LucideActivity,
  },
  {
    path: 'categories',
    label: 'Kategorieliste',
    description: 'Vinted-Kategorien',
    icon: LucideTags,
  },
] as const;

const DEFAULT_SECTION = 'queries';

/** Das, was die Huelle vom Auswahlfeld braucht: seinen Wert. */
export type SectionSelect = Pick<CustomSelectComponent<string>, 'value'>;

/**
 * Rahmen fuer alles rund um den Vinted Bot in der Administration.
 *
 * Aufgebaut wie die Einstellungen (settings-shell): ab grossen Bildschirmen
 * eine Linkliste links, darunter ein Auswahlfeld. Die Breite ist begrenzt,
 * weil keine der Bot-Seiten die volle Inhaltsbreite braucht.
 */
@Component({
  selector: 'app-vinted-bot-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    LucideDynamicIcon,
    CustomSelectComponent,
    PageHeaderComponent,
  ],
  templateUrl: './vinted-bot-shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class VintedBotShellComponent {
  private readonly router = inject(Router);

  readonly navigation = VINTED_BOT_NAVIGATION;
  readonly mobileOptions: readonly SelectOption<string>[] = this.navigation.map((item) => ({
    value: item.path,
    label: item.label,
    description: item.description,
    icon: item.icon,
  }));

  /** Der Bereich, der tatsaechlich angezeigt wird. */
  readonly currentPath = signal(sectionFromUrl(this.router.url));

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.currentPath.set(sectionFromUrl(event.urlAfterRedirects)));
  }

  /**
   * Wechselt nach einer Auswahl den Bereich.
   *
   * Das Auswahlfeld setzt seinen Wert selbst, bevor die Navigation feststeht.
   * Lehnt der Waechter fuer ungespeicherte Aenderungen den Wechsel ab, zeigte
   * es sonst schon den neuen Bereich - und ein zweites Auswaehlen desselben
   * Bereichs loeste nichts mehr aus. Ueber die Bindung laesst sich das nicht
   * zuruecknehmen: `currentPath` hat sich nie geaendert, fuer Angular gibt es
   * also nichts weiterzugeben. Deshalb wird der Wert direkt im Feld
   * zurueckgesetzt.
   */
  async onMobileSectionChange(path: string | null, select?: SectionSelect): Promise<void> {
    if (!path || !this.navigation.some((item) => item.path === path)) return;
    const navigated = await this.router.navigate(['/admin/vinted-bot', path]);
    if (!navigated) select?.value.set(this.currentPath());
  }
}

function sectionFromUrl(url: string): string {
  return url.split(/[?#]/u)[0].split('/').filter(Boolean)[2] ?? DEFAULT_SECTION;
}
