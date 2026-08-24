import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  CropperPosition,
  Dimensions,
  ImageCropperComponent,
  ImageCroppedEvent,
  ImageTransform,
  LoadedImage,
} from 'ngx-image-cropper';
import {
  LucideDynamicIcon,
  LucideLocateFixed as LocateFixed,
  LucideRotateCw as RotateCw,
  LucideUndo2 as Undo2,
} from '@lucide/angular';
import { Rechteck } from '../../models/plattform-profile';
import { begrenzeZoom, skaliereAusschnitt } from './editor-transform';
import { leiteAb } from '../../services/zuschnitt';

/** Legt den Ausschnitt im festen Format der aktiven Plattform fest. */
@Component({
  selector: 'app-zuschnitt-editor',
  imports: [ImageCropperComponent, LucideDynamicIcon],
  templateUrl: './zuschnitt-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZuschnittEditorComponent {
  readonly datenUrl = input.required<string>();
  readonly verhaeltnis = input.required<number>();
  readonly deaktiviert = input(false);
  /** Der fuer dieses Bild bereits gespeicherte Ausschnitt, in Originalpixeln. */
  readonly gespeicherterAusschnitt = input<Rechteck | null>(null);

  readonly ausschnittGeaendert = output<Rechteck>();
  readonly drehen = output<void>();
  /** `loadImageFailed` der Bibliothek, durchgereicht - z.B. bei HEIC-Fotos. */
  readonly ladenFehlgeschlagen = output<void>();

  /**
   * `imageLoaded` der Bibliothek, durchgereicht. Die Seite loescht damit einen
   * zuvor gemeldeten Lesefehler wieder: Ohne dieses Gegenstueck bliebe die
   * Meldung fuer dieses Bild dauerhaft stehen, auch wenn es sich laengst
   * anzeigen laesst.
   */
  readonly bildGeladen = output<void>();

  // Groesse des Originalbildes (aus `imageLoaded`) und der tatsaechlich
  // angezeigten Flaeche (aus `cropperReady`) - beide werden gebraucht, um
  // `wiederherstellenZiel` (Originalpixel) in die Anzeigepixel umzurechnen,
  // die `[cropper]` erwartet. Beide sind erst asynchron nach dem Laden des
  // Bildes bekannt, deshalb signal statt computed.
  private readonly originalGroesse = signal<Dimensions | null>(null);
  private readonly angezeigteGroesse = signal<Dimensions | null>(null);

  // Schnappschuss von `gespeicherterAusschnitt()` zum Zeitpunkt eines Bild-
  // oder Plattformwechsels. Bewusst kein computed auf dem Input direkt:
  // Waehrend der Nutzer zieht, aktualisiert die Elternkomponente den
  // Plattform-Zuschnitt bei jedem Zwischenschritt, was sonst bei jedem
  // Mausschritt einen neuen `[cropper]`-Wert erzeugen wuerde.
  private readonly wiederherstellenZiel = signal<Rechteck | null>(null);
  private letzteDatenUrl: string | null = null;

  readonly rotateIcon = RotateCw;
  readonly centerIcon = LocateFixed;
  readonly resetIcon = Undo2;
  readonly transform = signal<ImageTransform>({ scale: 1, translateH: 0, translateV: 0 });

  constructor() {
    // Bei einem Bild- oder Plattformwechsel wird der dafuer gespeicherte
    // Rahmen wiederhergestellt. Die Bildgroessen werden nur bei einer neuen
    // URL verworfen: Beim Plattformwechsel braucht `cropperEingabe` die schon
    // bekannten Werte sofort weiter. `gespeicherterAusschnitt()` bleibt
    // bewusst untracked, damit Zwischenstaende waehrend einer Ziehbewegung
    // keinen Reset ausloesen.
    effect(() => {
      const datenUrl = this.datenUrl();
      this.verhaeltnis();

      if (datenUrl !== this.letzteDatenUrl) {
        this.letzteDatenUrl = datenUrl;
        this.originalGroesse.set(null);
        this.angezeigteGroesse.set(null);
        this.transform.set({ scale: 1, translateH: 0, translateV: 0 });
      }

      this.wiederherstellenZiel.set(untracked(this.gespeicherterAusschnitt));
    });
  }

  /**
   * Der gespeicherte Ausschnitt (Originalpixel), umgerechnet in die
   * Anzeigepixel, die der `[cropper]`-Input der Bibliothek erwartet.
   *
   * `undefined`, solange Original- oder Anzeigegroesse noch nicht bekannt
   * sind, oder wenn es fuer dieses Bild gar keinen gespeicherten Ausschnitt
   * gibt - dann bleibt es beim eingebauten Verhalten (voller Rahmen).
   *
   * Laut Dokumentation der Bibliothek ist genau das der vorgesehene Weg, eine
   * fruehere Rahmenposition wiederherzustellen: ein neues Objekt auf
   * `[cropper]` setzen und dabei auf `cropperReady` warten.
   */
  readonly cropperEingabe = computed<CropperPosition | undefined>(() => {
    const ausschnitt = this.wiederherstellenZiel();
    const original = this.originalGroesse();
    const angezeigt = this.angezeigteGroesse();
    if (!ausschnitt || !original || !angezeigt) {
      return undefined;
    }
    return skaliereAusschnitt(ausschnitt, original, angezeigt);
  });

  /** `(imageLoaded)`: liefert die Originalgroesse fuer `cropperEingabe`. */
  beiBildGeladen(bild: LoadedImage): void {
    this.originalGroesse.set(bild.original.size);
    this.bildGeladen.emit();
  }

  /** `(cropperReady)`: liefert die Anzeigegroesse fuer `cropperEingabe`. */
  beiCropperBereit(dimensionen: Dimensions): void {
    this.angezeigteGroesse.set(dimensionen);
  }

  beiZuschnitt(ereignis: ImageCroppedEvent): void {
    // Die Bibliothek erzeugt fuer jede Zuschnitt-Geste eine Object-URL des
    // gerenderten Vorschaubildes (`objectUrl`). Gebraucht wird hier nur
    // `imagePosition`, das gerenderte Bild selbst nie - ungenutzt bliebe die
    // URL sonst dauerhaft im Speicher stehen, bei jedem Ziehen am Rahmen neu.
    if (ereignis.objectUrl) URL.revokeObjectURL(ereignis.objectUrl);
    if (this.deaktiviert()) return;

    // imagePosition ist in Pixeln des Originalbildes. So bleibt der
    // gespeicherte Zuschnitt unabhaengig von der Fenstergroesse.
    const p = ereignis.imagePosition;
    const ausschnitt: Rechteck = {
      x: p.x1,
      y: p.y1,
      breite: p.x2 - p.x1,
      hoehe: p.y2 - p.y1,
    };

    this.ausschnittGeaendert.emit(ausschnitt);
  }

  beiTransform(transform: ImageTransform): void {
    this.transform.set({ ...transform, scale: begrenzeZoom(transform.scale ?? 1) });
  }

  setzeZoom(wert: string): void {
    const scale = begrenzeZoom(Number(wert));
    this.transform.update((aktuell) => ({ ...aktuell, scale }));
  }

  zentriere(): void {
    this.transform.update((aktuell) => ({ ...aktuell, translateH: 0, translateV: 0 }));
  }

  zuruecksetzen(): void {
    this.transform.set({ scale: 1, translateH: 0, translateV: 0 });
    const original = this.originalGroesse();
    if (!original) return;
    this.wiederherstellenZiel.set(
      leiteAb({ x: 0, y: 0, breite: original.width, hoehe: original.height }, this.verhaeltnis()),
    );
  }
}
