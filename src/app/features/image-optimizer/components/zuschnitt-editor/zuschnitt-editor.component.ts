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
import { CropperPosition, ImageCropperComponent, ImageCroppedEvent } from 'ngx-image-cropper';
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
})
export class ZuschnittEditorComponent {
  private readonly elementRef = inject(ElementRef);

  readonly datenUrl = input.required<string>();
  readonly profile = input.required<PlattformProfil[]>();

  readonly ausschnittGeaendert = output<Rechteck>();

  readonly drehung = signal(0);
  readonly letzterAusschnitt = signal<Rechteck | null>(null);
  readonly letzteRahmenposition = signal<CropperPosition | null>(null);

  readonly rotateIcon = RotateCw;

  constructor() {
    // Wechselt das Bild (z.B. durch den Filmstreifen), muessen Drehung und
    // der zuletzt gezogene Rahmen zurueckgesetzt werden - Angular erzeugt
    // die Komponente bei einer reinen Input-Aenderung nicht neu, sonst
    // wuerde das neue Foto die Drehung und den Safe-Area-Rahmen des
    // vorherigen Bildes erben. Der Effect haengt bewusst nur an
    // `datenUrl()`: die zurueckgesetzten Signale werden hier nur
    // geschrieben, nie gelesen, damit ein frisches Zuschnitt-Ereignis
    // (beiZuschnitt) diesen Effect nicht erneut auslöst.
    effect(() => {
      this.datenUrl();
      this.drehung.set(0);
      this.letzterAusschnitt.set(null);
      this.letzteRahmenposition.set(null);
    });
  }

  /**
   * Die Position des Safe-Area-Rahmens in Anzeigepixeln, fuer die Darstellung
   * ueber dem Cropper.
   *
   * Der Rahmen wird bewusst aus zwei verschiedenen Rechtecken berechnet:
   * `letzterAusschnitt` (imagePosition, Pixel des Originalbildes) liefert das
   * Verhaeltnis der Safe-Area zum Ausschnitt, `letzteRahmenposition`
   * (cropperPosition, Anzeigepixel) liefert die Flaeche, ueber die dieses
   * Verhaeltnis gelegt wird. Beide durcheinanderzubringen ist der
   * naheliegende Fehler: Nur cropperPosition beschreibt die Flaeche, in der
   * dieser Rahmen tatsaechlich liegt (das Koordinatensystem von
   * <image-cropper>) - imagePosition wuerde den Rahmen wieder auf den
   * gesamten Cropper zentrieren statt auf den vom Nutzer gezogenen
   * Zuschnitt.
   *
   * `cropperPosition` (und damit `rahmenposition`) ist relativ zur
   * gerenderten Bildflaeche innerhalb von <image-cropper> angegeben, nicht
   * relativ zum umschliessenden `.relative`-Wrapper, an dem der Rahmen per
   * `position: absolute` haengt. ngx-image-cropper ruecken die Bildflaeche
   * per eigenem Stylesheet vom Host-Rand ab, deshalb reicht `rahmenposition`
   * allein nicht - der Versatz zwischen Bildflaeche und Wrapper wird darum
   * zur Laufzeit gemessen (siehe `versatz()`) statt als fester Pixelwert
   * angenommen, weil er von der Bibliotheksversion abhaengt.
   */
  readonly sichererBereichRahmen = computed(() => {
    const ausschnitt = this.letzterAusschnitt();
    const rahmenposition = this.letzteRahmenposition();
    if (!ausschnitt || !rahmenposition) return null;

    const sicher = safeArea(ausschnitt, this.profile());

    const rahmenBreite = rahmenposition.x2 - rahmenposition.x1;
    const rahmenHoehe = rahmenposition.y2 - rahmenposition.y1;

    const anteilBreite = sicher.breite / ausschnitt.breite;
    const anteilHoehe = sicher.hoehe / ausschnitt.hoehe;

    const breite = rahmenBreite * anteilBreite;
    const hoehe = rahmenHoehe * anteilHoehe;

    const versatz = this.versatz();

    return {
      breite,
      hoehe,
      links: rahmenposition.x1 + (rahmenBreite - breite) / 2 + versatz.links,
      oben: rahmenposition.y1 + (rahmenHoehe - hoehe) / 2 + versatz.oben,
    };
  });

  /**
   * Versatz zwischen der von <image-cropper> gerenderten Bildflaeche
   * (`.ngx-ic-source-image`) und dem `.relative`-Wrapper, gegen den der
   * Safe-Area-Rahmen per `position: absolute` positioniert wird. Wird zur
   * Laufzeit gemessen statt hartkodiert, weil der Versatz aus dem
   * Stylesheet von ngx-image-cropper stammt und sich mit einer neuen
   * Bibliotheksversion aendern kann. Faellt auf 0 zurueck, wenn eines der
   * Elemente (noch) nicht im DOM steht - das erste Zuschnitt-Ereignis kann
   * eintreffen, bevor das Layout fertig ist.
   */
  private versatz(): { links: number; oben: number } {
    const host = this.elementRef.nativeElement as HTMLElement;
    const wrapper = host.querySelector<HTMLElement>('.relative');
    const bild = host.querySelector<HTMLElement>('.ngx-ic-source-image');
    if (!wrapper || !bild) return { links: 0, oben: 0 };

    const wrapperRect = wrapper.getBoundingClientRect();
    const bildRect = bild.getBoundingClientRect();

    return {
      links: bildRect.left - wrapperRect.left,
      oben: bildRect.top - wrapperRect.top,
    };
  }

  beiZuschnitt(ereignis: ImageCroppedEvent): void {
    // imagePosition ist in Pixeln des Originalbildes - fuer die Ableitung
    // der Plattformformate (safeArea/leiteAb) muss darin gerechnet werden,
    // sonst haengt das Ergebnis von der Fenstergroesse ab. cropperPosition
    // ist in Anzeigepixeln des <image-cropper>-Elements und wird separat
    // fuer die Darstellung des Rahmens gespeichert (siehe
    // sichererBereichRahmen).
    const p = ereignis.imagePosition;
    const ausschnitt: Rechteck = {
      x: p.x1,
      y: p.y1,
      breite: p.x2 - p.x1,
      hoehe: p.y2 - p.y1,
    };

    this.letzterAusschnitt.set(ausschnitt);
    this.letzteRahmenposition.set(ereignis.cropperPosition);
    this.ausschnittGeaendert.emit(ausschnitt);
  }

  drehe(): void {
    this.drehung.update((g) => (g + 90) % 360);
  }
}
