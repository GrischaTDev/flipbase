import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

export interface PlatformAdminNavigationItem {
  readonly path: string;
  readonly label: string;
}

/**
 * Die Punkte der Administration.
 *
 * Als Liste und nicht als fest verdrahtete Links: Paket 2 bringt zwei weitere
 * Seiten in denselben Bereich, und die sollen mit einer Zeile hier dazukommen,
 * ohne dass die Vorlage angefasst werden muss.
 */
export const PLATFORM_ADMIN_NAVIGATION: readonly PlatformAdminNavigationItem[] = [
  { path: 'applications', label: 'Bewerbungen' },
  { path: 'queries', label: 'Sammelaufträge' },
  { path: 'operation', label: 'Botbetrieb' },
  { path: 'categories', label: 'Kategorieliste' },
] as const;

/**
 * Rahmen der Administration mit der Unternavigation.
 *
 * Ohne sie war die Kategorieliste nur ueber eine von Hand eingetippte Adresse
 * erreichbar: Die Seitenleiste hat genau einen Punkt auf /admin, und der
 * leitet auf die Bewerbungen um.
 *
 * Aufgebaut wie die Unternavigation der Einstellungen
 * (settings-shell.component.html): routerLinkActive setzt die Auszeichnung,
 * und dieselbe Direktive liefert ueber ihre Referenz den Zustand fuer
 * aria-current - eine rein farbliche Hervorhebung sagt niemandem etwas, der
 * einen Screenreader benutzt.
 */
@Component({
  selector: 'app-platform-admin-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './platform-admin-shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class PlatformAdminShellComponent {
  readonly navigation = PLATFORM_ADMIN_NAVIGATION;
}
