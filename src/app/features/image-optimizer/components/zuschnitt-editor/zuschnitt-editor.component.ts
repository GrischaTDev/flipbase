import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
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
})
export class ZuschnittEditorComponent {
  readonly datenUrl = input.required<string>();
  readonly profile = input.required<PlattformProfil[]>();

  readonly ausschnittGeaendert = output<Rechteck>();

  readonly drehung = signal(0);
  readonly letzterAusschnitt = signal<Rechteck | null>(null);

  readonly rotateIcon = RotateCw;

  /** Der Bereich, den keine gewaehlte Plattform anschneidet - als Anteil. */
  readonly sichererBereichInProzent = computed(() => {
    const a = this.letzterAusschnitt();
    if (!a) return null;

    const sicher = safeArea(a, this.profile());
    return {
      breite: (sicher.breite / a.breite) * 100,
      hoehe: (sicher.hoehe / a.hoehe) * 100,
    };
  });

  beiZuschnitt(ereignis: ImageCroppedEvent): void {
    // imagePosition ist in Pixeln des Originalbildes - cropperPosition waere
    // in Anzeigepixeln und damit von der Fenstergroesse abhaengig.
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

  drehe(): void {
    this.drehung.update((g) => (g + 90) % 360);
  }
}
