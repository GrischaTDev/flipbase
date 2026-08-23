import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PlattformProfil, Rechteck } from '../../models/plattform-profile';

/**
 * Zeigt, wie der Artikel in der Trefferliste der Plattform aussieht.
 *
 * Bewusst **kein** originalgetreuer Nachbau: keine fremden Logos, Schriften
 * oder Farbwelten. Fuer die Frage "wird mein Produkt angeschnitten?" traegt
 * allein die Bildoeffnung etwas bei - Seitenverhaeltnis und ob geschnitten
 * oder eingepasst wird. Beides ist gemessen, siehe Profil.
 */
@Component({
  selector: 'app-plattform-vorschau',
  imports: [],
  templateUrl: './plattform-vorschau.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlattformVorschauComponent {
  readonly plattform = input.required<PlattformProfil>();
  readonly datenUrl = input.required<string>();
  readonly ausschnitt = input<Rechteck | null>(null);

  /** `cover` schneidet, `contain` passt ein - genau wie die echte Liste. */
  readonly bildAnpassung = computed(() => (this.plattform().schneidet ? 'cover' : 'contain'));

  readonly seitenverhaeltnis = computed(() => this.plattform().kachelVerhaeltnis);
}
