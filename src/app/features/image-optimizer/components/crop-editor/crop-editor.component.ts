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
import { Rect } from '../../models/platform-profile';
import { clampZoom, scaleCropToDisplay } from './editor-transform';
import { deriveRect } from '../../services/crop';

/** Legt den Ausschnitt im festen Format der aktiven Plattform fest. */
@Component({
  selector: 'app-crop-editor',
  imports: [ImageCropperComponent, LucideDynamicIcon],
  templateUrl: './crop-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CropEditorComponent {
  readonly dataUrl = input.required<string>();
  readonly ratio = input.required<number>();
  readonly disabled = input(false);
  /** Der fuer dieses Bild bereits gespeicherte Ausschnitt, in Originalpixeln. */
  readonly storedCrop = input<Rect | null>(null);

  readonly cropChanged = output<Rect>();
  readonly rotateRequested = output<void>();
  /** `loadImageFailed` der Bibliothek, durchgereicht - z.B. bei HEIC-Fotos. */
  readonly loadFailed = output<void>();

  /**
   * `imageLoaded` der Bibliothek, durchgereicht. Die Seite loescht damit einen
   * zuvor gemeldeten Lesefehler wieder: Ohne dieses Gegenstueck bliebe die
   * Meldung fuer dieses Bild dauerhaft stehen, auch wenn es sich laengst
   * anzeigen laesst.
   */
  readonly imageLoadedEvent = output<void>();

  // Groesse des Originalbildes (aus `imageLoaded`) und der tatsaechlich
  // angezeigten Flaeche (aus `cropperReady`) - beide werden gebraucht, um
  // `wiederherstellenZiel` (Originalpixel) in die Anzeigepixel umzurechnen,
  // die `[cropper]` erwartet. Beide sind erst asynchron nach dem Laden des
  // Bildes bekannt, deshalb signal statt computed.
  private readonly originalGroesse = signal<Dimensions | null>(null);
  private readonly angezeigteGroesse = signal<Dimensions | null>(null);

  // Schnappschuss von `storedCrop()` zum Zeitpunkt eines Bild-
  // oder Plattformwechsels. Bewusst kein computed auf dem Input direkt:
  // Waehrend der Nutzer zieht, aktualisiert die Elternkomponente den
  // Plattform-Zuschnitt bei jedem Zwischenschritt, was sonst bei jedem
  // Mausschritt einen neuen `[cropper]`-Wert erzeugen wuerde.
  private readonly wiederherstellenZiel = signal<Rect | null>(null);
  private letzteDatenUrl: string | null = null;

  readonly rotateIcon = RotateCw;
  readonly centerIcon = LocateFixed;
  readonly resetIcon = Undo2;
  readonly transform = signal<ImageTransform>({ scale: 1, translateH: 0, translateV: 0 });

  constructor() {
    // Bei einem Bild- oder Plattformwechsel wird der dafuer gespeicherte
    // Rahmen wiederhergestellt. Die Bildgroessen werden nur bei einer neuen
    // URL verworfen: Beim Plattformwechsel braucht `cropperInput` die schon
    // bekannten Werte sofort weiter. `storedCrop()` bleibt
    // bewusst untracked, damit Zwischenstaende waehrend einer Ziehbewegung
    // keinen Reset ausloesen.
    effect(() => {
      const dataUrl = this.dataUrl();
      this.ratio();

      if (dataUrl !== this.letzteDatenUrl) {
        this.letzteDatenUrl = dataUrl;
        this.originalGroesse.set(null);
        this.angezeigteGroesse.set(null);
        this.transform.set({ scale: 1, translateH: 0, translateV: 0 });
      }

      this.wiederherstellenZiel.set(untracked(this.storedCrop));
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
  readonly cropperInput = computed<CropperPosition | undefined>(() => {
    const ausschnitt = this.wiederherstellenZiel();
    const original = this.originalGroesse();
    const angezeigt = this.angezeigteGroesse();
    if (!ausschnitt || !original || !angezeigt) {
      return undefined;
    }
    return scaleCropToDisplay(ausschnitt, original, angezeigt);
  });

  /** `(imageLoaded)`: liefert die Originalgroesse fuer `cropperInput`. */
  beiBildGeladen(bild: LoadedImage): void {
    this.originalGroesse.set(bild.original.size);
    this.imageLoadedEvent.emit();
  }

  /** `(cropperReady)`: liefert die Anzeigegroesse fuer `cropperInput`. */
  beiCropperBereit(dimensionen: Dimensions): void {
    this.angezeigteGroesse.set(dimensionen);
  }

  beiZuschnitt(ereignis: ImageCroppedEvent): void {
    // Die Bibliothek erzeugt fuer jede Zuschnitt-Geste eine Object-URL des
    // gerenderten Vorschaubildes (`objectUrl`). Gebraucht wird hier nur
    // `imagePosition`, das gerenderte Bild selbst nie - ungenutzt bliebe die
    // URL sonst dauerhaft im Speicher stehen, bei jedem Ziehen am Rahmen neu.
    if (ereignis.objectUrl) URL.revokeObjectURL(ereignis.objectUrl);
    if (this.disabled()) return;

    // imagePosition ist in Pixeln des Originalbildes. So bleibt der
    // gespeicherte Zuschnitt unabhaengig von der Fenstergroesse.
    const p = ereignis.imagePosition;
    const ausschnitt: Rect = {
      x: p.x1,
      y: p.y1,
      width: p.x2 - p.x1,
      height: p.y2 - p.y1,
    };

    this.cropChanged.emit(ausschnitt);
  }

  beiTransform(transform: ImageTransform): void {
    this.transform.set({ ...transform, scale: clampZoom(transform.scale ?? 1) });
  }

  setZoom(wert: string): void {
    const scale = clampZoom(Number(wert));
    this.transform.update((aktuell) => ({ ...aktuell, scale }));
  }

  center(): void {
    this.transform.update((aktuell) => ({ ...aktuell, translateH: 0, translateV: 0 }));
  }

  reset(): void {
    this.transform.set({ scale: 1, translateH: 0, translateV: 0 });
    const original = this.originalGroesse();
    if (!original) return;
    this.wiederherstellenZiel.set(
      deriveRect({ x: 0, y: 0, width: original.width, height: original.height }, this.ratio()),
    );
  }
}
