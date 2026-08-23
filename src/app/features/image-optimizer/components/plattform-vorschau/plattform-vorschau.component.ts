import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { PlattformProfil, Rechteck } from '../../models/plattform-profile';
import { leiteAb } from '../../services/zuschnitt';

/**
 * Zeigt, wie das exportierte Bild in der Trefferliste der Plattform
 * aussieht - nicht das ganze Originalfoto, sondern der Ausschnitt daraus,
 * den der Export tatsaechlich erzeugt (`leiteAb`, gleiches Seitenverhaeltnis
 * wie die Kachel).
 *
 * Bewusst **kein** originalgetreuer Nachbau: keine fremden Logos, Schriften
 * oder Farbwelten. Ist noch kein Ausschnitt gewaehlt, wird wie zuvor das
 * ganze Bild gezeigt, ob geschnitten oder eingepasst - siehe Profil.
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

  /** Natuerliche Groesse von `datenUrl()`, gelesen aus dem `load`-Ereignis des `<img>`. */
  readonly bildgroesse = signal<{ breite: number; hoehe: number } | null>(null);

  /** `cover` schneidet, `contain` passt ein - genau wie die echte Liste. Nur ohne gewaehlten Ausschnitt relevant. */
  readonly bildAnpassung = computed(() => (this.plattform().schneidet ? 'cover' : 'contain'));

  readonly seitenverhaeltnis = computed(() => this.plattform().kachelVerhaeltnis);

  /**
   * Das Rechteck des Originalbildes, das die Kachel fuellen soll: der
   * gewaehlte Ausschnitt, zugeschnitten auf das Kachelverhaeltnis
   * (`leiteAb`) - dieselbe Ableitung wie beim Export. Null, solange kein
   * Ausschnitt gewaehlt oder die Bildgroesse noch nicht bekannt ist; dann
   * zeigt das Template stattdessen das ganze Bild.
   */
  readonly abgeleiteterAusschnitt = computed<Rechteck | null>(() => {
    const ausschnitt = this.ausschnitt();
    if (!ausschnitt) return null;

    return leiteAb(ausschnitt, this.seitenverhaeltnis());
  });

  /**
   * Position und Groesse des `<img>` in Prozent der Bildoeffnung: Das Bild
   * wird so weit vergroessert und verschoben, dass genau das abgeleitete
   * Rechteck (Pixel des Originalbildes) die Oeffnung fuellt - dieselbe
   * Rechnung wie beim Positionieren eines Ausschnitts per `background-image`,
   * nur mit einem absolut positionierten `<img>` statt eines Hintergrunds.
   */
  readonly bildPosition = computed(() => {
    const rechteck = this.abgeleiteterAusschnitt();
    const groesse = this.bildgroesse();
    if (!rechteck || !groesse) return null;

    return {
      breite: (groesse.breite / rechteck.breite) * 100,
      hoehe: (groesse.hoehe / rechteck.hoehe) * 100,
      links: -(rechteck.x / rechteck.breite) * 100,
      oben: -(rechteck.y / rechteck.hoehe) * 100,
    };
  });

  beiBildLaden(bild: EventTarget | null): void {
    const element = bild as HTMLImageElement;
    this.bildgroesse.set({ breite: element.naturalWidth, hoehe: element.naturalHeight });
  }
}
