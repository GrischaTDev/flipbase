import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';
import { LucideDynamicIcon, LucideRotateCw as RotateCw } from '@lucide/angular';
import { PlattformProfil, Rechteck } from '../../models/plattform-profile';
import { safeArea } from '../../services/zuschnitt';

/**
 * Legt den einen Ausschnitt fest, aus dem alle Plattformformate abgeleitet
 * werden.
 *
 * Der Rahmen ist bewusst frei im Seitenverhaeltnis: Der Nutzer waehlt den
 * Bildbereich, den er zeigen will - welches Format daraus wird, entscheidet
 * die Plattform, nicht er.
 */
@Component({
  selector: 'app-zuschnitt-editor',
  imports: [ImageCropperComponent, LucideDynamicIcon],
  templateUrl: './zuschnitt-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'beiFenstergroesse()' },
})
export class ZuschnittEditorComponent {
  private readonly elementRef = inject(ElementRef);

  readonly datenUrl = input.required<string>();
  readonly profile = input.required<PlattformProfil[]>();

  readonly ausschnittGeaendert = output<Rechteck>();
  readonly drehen = output<void>();

  readonly letzterAusschnitt = signal<Rechteck | null>(null);

  // Wird hochgezaehlt, wenn sich die tatsaechliche Box von `.ngx-ic-cropper`
  // aendert, damit `sichererBereichRahmen` den Zuschnittrahmen neu aus dem
  // DOM misst. Ausgeloest wird das durch `beiFenstergroesse()`
  // (window:resize), und zwar zweimal: ngx-image-cropper skaliert seinen
  // Rahmen bei einer Fenstergroessenaenderung selbst neu, feuert dabei aber
  // kein `imageCropped`-Ereignis - ohne dieses Signal wuerde der `computed()`
  // das nicht bemerken und weiter mit der alten Geometrie rechnen.
  private readonly rahmenVersion = signal(0);

  readonly rotateIcon = RotateCw;

  constructor() {
    // Wechselt das Bild (z.B. durch den Filmstreifen), muss der zuletzt
    // gezogene Rahmen zurueckgesetzt werden - Angular erzeugt die Komponente
    // bei einer reinen Input-Aenderung nicht neu, sonst wuerde das neue Foto
    // den Safe-Area-Rahmen des vorherigen Bildes erben. Der Effect haengt
    // bewusst nur an `datenUrl()`: das zurueckgesetzte Signal wird hier nur
    // geschrieben, nie gelesen, damit ein frisches Zuschnitt-Ereignis
    // (beiZuschnitt) diesen Effect nicht erneut auslöst.
    effect(() => {
      this.datenUrl();
      this.letzterAusschnitt.set(null);
    });
  }

  /**
   * Verdrahtet ueber das `host`-Objekt (kein `@HostListener` im Projekt).
   *
   * Zaehlt zweimal hoch: einmal sofort, einmal erst im naechsten Frame.
   * ngx-image-cropper legt seinen Zuschnittrahmen beim selben
   * `resize`-Ereignis neu aus, aber erst nach diesem Handler - wer nur
   * einmal misst, misst also noch die Geometrie von davor. Der zweite
   * Durchgang laeuft, nachdem das Layout der Bibliothek steht, und liefert
   * die korrekte Groesse.
   */
  beiFenstergroesse(): void {
    this.rahmenVersion.update((n) => n + 1);
    requestAnimationFrame(() => this.rahmenVersion.update((n) => n + 1));
  }

  /**
   * Die Position des Safe-Area-Rahmens in Anzeigepixeln, fuer die Darstellung
   * ueber dem Cropper.
   *
   * Die Flaeche, ueber die der Rahmen gelegt wird, wird direkt aus dem DOM
   * gemessen (`.ngx-ic-cropper`) statt aus `cropperPosition` abgeleitet:
   * ngx-image-cropper skaliert seinen Zuschnittrahmen bei einer
   * Fenstergroessenaenderung selbst neu, feuert dabei aber kein
   * `imageCropped`-Ereignis. Ein gespeichertes `cropperPosition` wuerde also
   * nach einem Resize die Geometrie von davor beschreiben, waehrend der
   * tatsaechliche Rahmen laengst woanders sitzt - der Safe-Area-Rahmen
   * wuerde vom Zuschnittrahmen abdriften. Die direkte Messung liest immer
   * die aktuelle Position, unabhaengig davon, ob/wann die Bibliothek ein
   * Ereignis dazu feuert. `letzterAusschnitt` (imagePosition, Pixel des
   * Originalbildes) bleibt die Quelle fuer das Verhaeltnis der Safe-Area zum
   * Ausschnitt - dieser Pfad ist korrekt und wird hier nicht angefasst.
   *
   * Haengt bewusst an `rahmenVersion()`, obwohl dessen Wert selbst nicht
   * gebraucht wird: Nur dadurch wird bei einer Groessenaenderung neu
   * gemessen, da `querySelector`/`getBoundingClientRect` von Angular nicht
   * als Signal-Abhaengigkeit erkannt werden.
   */
  readonly sichererBereichRahmen = computed(() => {
    const ausschnitt = this.letzterAusschnitt();
    this.rahmenVersion();
    if (!ausschnitt) return null;

    const rahmenRect = this.rahmenRect();
    if (!rahmenRect) return null;

    const sicher = safeArea(ausschnitt, this.profile());

    const anteilBreite = sicher.breite / ausschnitt.breite;
    const anteilHoehe = sicher.hoehe / ausschnitt.hoehe;

    const breite = rahmenRect.breite * anteilBreite;
    const hoehe = rahmenRect.hoehe * anteilHoehe;

    return {
      breite,
      hoehe,
      links: rahmenRect.links + (rahmenRect.breite - breite) / 2,
      oben: rahmenRect.oben + (rahmenRect.hoehe - hoehe) / 2,
    };
  });

  /**
   * Position und Groesse des von <image-cropper> gerenderten Zuschnittrahmens
   * (`.ngx-ic-cropper`), relativ zum umschliessenden `.relative`-Wrapper, an
   * dem der Safe-Area-Rahmen per `position: absolute` haengt. Wird zur
   * Laufzeit gemessen statt aus einem Ereignis uebernommen, weil der Rahmen
   * bei einer Fenstergroessenaenderung ohne Ereignis verschoben wird (siehe
   * `sichererBereichRahmen`). Faellt auf `null` zurueck, wenn eines der
   * Elemente (noch) nicht im DOM steht - dann wird kein Rahmen gerendert,
   * statt mit falschen Werten zu rechnen.
   */
  private rahmenRect(): { links: number; oben: number; breite: number; hoehe: number } | null {
    const host = this.elementRef.nativeElement as HTMLElement;
    const wrapper = host.querySelector<HTMLElement>('.relative');
    const rahmen = host.querySelector<HTMLElement>('.ngx-ic-cropper');
    if (!wrapper || !rahmen) return null;

    const wrapperRect = wrapper.getBoundingClientRect();
    const rahmenRect = rahmen.getBoundingClientRect();

    return {
      links: rahmenRect.left - wrapperRect.left,
      oben: rahmenRect.top - wrapperRect.top,
      breite: rahmenRect.width,
      hoehe: rahmenRect.height,
    };
  }

  beiZuschnitt(ereignis: ImageCroppedEvent): void {
    // imagePosition ist in Pixeln des Originalbildes - fuer die Ableitung
    // der Plattformformate (safeArea/leiteAb) muss darin gerechnet werden,
    // sonst haengt das Ergebnis von der Fenstergroesse ab. Die Anzeigeflaeche
    // des Zuschnittrahmens wird nicht mehr aus diesem Ereignis uebernommen,
    // sondern bei Bedarf direkt aus dem DOM gemessen (siehe `rahmenRect`) -
    // ngx-image-cropper aendert sie bei einer Fenstergroessenaenderung ohne
    // ein neues Ereignis zu feuern.
    const p = ereignis.imagePosition;
    const ausschnitt: Rechteck = {
      x: p.x1,
      y: p.y1,
      breite: p.x2 - p.x1,
      hoehe: p.y2 - p.y1,
    };

    this.letzterAusschnitt.set(ausschnitt);
    this.ausschnittGeaendert.emit(ausschnitt);
  }
}
