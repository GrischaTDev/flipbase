import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { PlattformProfil, Rechteck } from '../../models/plattform-profile';
import { leiteAb } from '../../services/zuschnitt';

/** Ermittelt den sichtbaren Ausschnitt aus gespeichertem Crop oder dem ganzen Bild. */
export function ermittleVorschauAusschnitt(
  ausschnitt: Rechteck | null,
  bildgroesse: { breite: number; hoehe: number } | null,
  zielverhaeltnis: number,
): Rechteck | null {
  const basis =
    ausschnitt ??
    (bildgroesse ? { x: 0, y: 0, breite: bildgroesse.breite, hoehe: bildgroesse.hoehe } : null);

  return basis ? leiteAb(basis, zielverhaeltnis) : null;
}

/**
 * Zeigt, wie das exportierte Bild in der Trefferliste der Plattform
 * aussieht - nicht das ganze Originalfoto, sondern der Ausschnitt daraus,
 * den der Export tatsaechlich erzeugt (`leiteAb`, gleiches Seitenverhaeltnis
 * wie die Kachel).
 *
 * Bewusst **kein** originalgetreuer Nachbau: keine fremden Logos, Schriften
 * oder Farbwelten. Ist noch kein Ausschnitt gewaehlt, dient das volle Bild
 * als Basis und wird auf das Plattform-/Kachelverhaeltnis abgeleitet.
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

  constructor() {
    // Die natuerliche Groesse gehoert zu genau einem datenUrl. Ohne dieses
    // Zuruecksetzen rechnet die Kachel nach einem Bildwechsel - und nach einer
    // Drehung, bei der Breite und Hoehe tauschen - mit den Massen des vorherigen
    // Fotos weiter und zeigt verschobene, angeschnittene Bereiche.
    effect(() => {
      this.datenUrl();
      this.bildgroesse.set(null);
    });
  }

  /** `cover` schneidet, `contain` passt ein - genau wie die echte Liste. Nur ohne gewaehlten Ausschnitt relevant. */
  readonly bildAnpassung = computed(() => (this.plattform().schneidet ? 'cover' : 'contain'));

  readonly seitenverhaeltnis = computed(() => this.plattform().kachelVerhaeltnis);

  /**
   * Das Rechteck des Originalbildes, das die Kachel fuellen soll: Der
   * gespeicherte Ausschnitt oder ersatzweise das volle Bild wird auf das
   * Kachelverhaeltnis zugeschnitten (`leiteAb`). Null nur, solange weder ein
   * Ausschnitt noch die natuerliche Bildgroesse bekannt ist.
   */
  readonly abgeleiteterAusschnitt = computed<Rechteck | null>(() => {
    return ermittleVorschauAusschnitt(
      this.ausschnitt(),
      this.bildgroesse(),
      this.seitenverhaeltnis(),
    );
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
