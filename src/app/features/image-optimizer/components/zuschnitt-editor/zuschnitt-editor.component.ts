import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
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
  readonly datenUrl = input.required<string>();
  readonly profile = input.required<PlattformProfil[]>();

  readonly ausschnittGeaendert = output<Rechteck>();

  readonly drehung = signal(0);
  readonly letzterAusschnitt = signal<Rechteck | null>(null);
  readonly letzteRahmenposition = signal<CropperPosition | null>(null);

  readonly rotateIcon = RotateCw;

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

    return {
      breite,
      hoehe,
      links: rahmenposition.x1 + (rahmenBreite - breite) / 2,
      oben: rahmenposition.y1 + (rahmenHoehe - hoehe) / 2,
    };
  });

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
