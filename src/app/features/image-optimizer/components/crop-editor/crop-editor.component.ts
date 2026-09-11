import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
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
  LucideInfo as Info,
  LucideLocateFixed as LocateFixed,
  LucideMinus as Minus,
  LucidePlus as Plus,
  LucideRotateCw as RotateCw,
  LucideSlidersHorizontal as Sliders,
  LucideUndo2 as Undo2,
} from '@lucide/angular';
import { Rect } from '../../models/platform-profile';
import { clampZoom, scaleCropToDisplay } from './editor-transform';
import { deriveRect } from '../../services/crop';
import { AdjustmentControlsComponent } from '../adjustment-controls/adjustment-controls.component';
import { Adjustments } from '../../models/image-adjustments';

/** Legt den Ausschnitt im festen Format der aktiven Plattform fest. */
@Component({
  selector: 'app-crop-editor',
  imports: [ImageCropperComponent, LucideDynamicIcon, AdjustmentControlsComponent],
  templateUrl: './crop-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown.escape)': 'closePanel()',
  },
})
export class CropEditorComponent {
  readonly dataUrl = input.required<string>();
  readonly ratio = input.required<number>();
  readonly disabled = input(false);
  /** Der fuer dieses Bild bereits gespeicherte Ausschnitt, in Originalpixeln. */
  readonly storedCrop = input<Rect | null>(null);
  readonly adjustments = input.required<Adjustments>();
  /** Ob dieses Foto den Aufnahmeort enthaelt - der Knopf traegt dann einen Punkt. */
  readonly hasLocation = input(false);
  /**
   * Ob "Auf alle Bilder uebernehmen" ueberhaupt sinnvoll ist - die Elternseite
   * kennt die Bildanzahl, dieser Editor nicht. Standardmaessig aus: bei genau
   * einem Bild gibt es kein "alle" zum Uebernehmen.
   */
  readonly canApplyAdjustmentsToAll = input(false);

  readonly cropChanged = output<Rect>();
  readonly rotateRequested = output<void>();
  /** `loadImageFailed` der Bibliothek, durchgereicht - z.B. bei HEIC-Fotos. */
  readonly loadFailed = output<void>();
  readonly adjustmentsChanged = output<Adjustments>();
  readonly adjustmentsResetRequested = output<void>();
  readonly adjustmentsApplyToAllRequested = output<void>();
  readonly metadataRequested = output<void>();

  /**
   * `imageLoaded` der Bibliothek, durchgereicht. Die Seite loescht damit einen
   * zuvor gemeldeten Lesefehler wieder: Ohne dieses Gegenstueck bliebe die
   * Meldung fuer dieses Bild dauerhaft stehen, auch wenn es sich laengst
   * anzeigen laesst.
   */
  readonly imageLoadedEvent = output<void>();

  // Groesse des Originalbildes (aus `imageLoaded`) und der tatsaechlich
  // angezeigten Flaeche (aus `cropperReady`) - beide werden gebraucht, um
  // `restoreTarget` (Originalpixel) in die Anzeigepixel umzurechnen,
  // die `[cropper]` erwartet. Beide sind erst asynchron nach dem Laden des
  // Bildes bekannt, deshalb signal statt computed.
  private readonly originalSize = signal<Dimensions | null>(null);
  private readonly displayedSize = signal<Dimensions | null>(null);

  // Schnappschuss von `storedCrop()` zum Zeitpunkt eines Bild-
  // oder Plattformwechsels. Bewusst kein computed auf dem Input direkt:
  // Waehrend der Nutzer zieht, aktualisiert die Elternkomponente den
  // Plattform-Zuschnitt bei jedem Zwischenschritt, was sonst bei jedem
  // Mausschritt einen neuen `[cropper]`-Wert erzeugen wuerde.
  private readonly restoreTarget = signal<Rect | null>(null);
  private lastDataUrl: string | null = null;

  readonly rotateIcon = RotateCw;
  readonly centerIcon = LocateFixed;
  readonly resetIcon = Undo2;
  readonly panelIcon = Sliders;
  readonly infoIcon = Info;
  readonly plusIcon = Plus;
  readonly minusIcon = Minus;
  readonly transform = signal<ImageTransform>({ scale: 1, translateH: 0, translateV: 0 });

  /**
   * Das Farb-Panel liegt ueber dem Bild und ist standardmaessig zu.
   *
   * Vorher standen die Regler als eigene Karte unter dem Editor und machten
   * die Seite so lang, dass man zum Vergleichen scrollen musste - also genau
   * beim Beurteilen einer Farbaenderung das Bild nicht mehr sah.
   */
  readonly isPanelOpen = signal(false);

  private readonly injector = inject(Injector);
  private readonly colorPanel = viewChild<ElementRef<HTMLElement>>('colorPanel');
  private readonly colorToggleButton =
    viewChild<ElementRef<HTMLButtonElement>>('colorToggleButton');

  togglePanel(): void {
    const willOpen = !this.isPanelOpen();
    this.isPanelOpen.set(willOpen);
    this.moveFocusAfterToggle(willOpen);
  }

  closePanel(): void {
    if (!this.isPanelOpen()) return;
    this.isPanelOpen.set(false);
    this.moveFocusAfterToggle(false);
  }

  /**
   * Beim Oeffnen wandert der Fokus auf den ersten Regler, beim Schliessen
   * zurueck auf den Knopf, der das Panel geoeffnet hat - sonst waere das
   * Panel zwar mit der Tastatur zu oeffnen, aber nicht wieder zu verlassen.
   *
   * `afterNextRender` statt eines direkten Zugriffs, weil das Panel erst nach
   * der naechsten Aenderungserkennung im DOM steht (`@if`).
   */
  private moveFocusAfterToggle(isOpen: boolean): void {
    afterNextRender(
      () => {
        if (isOpen) {
          this.colorPanel()
            ?.nativeElement.querySelector<HTMLElement>('input[type="range"]')
            ?.focus();
        } else {
          this.colorToggleButton()?.nativeElement.focus();
        }
      },
      { injector: this.injector },
    );
  }

  private readonly ZOOM_STEP = 0.05;

  zoomIn(): void {
    this.setZoom(String((this.transform().scale ?? 1) + this.ZOOM_STEP));
  }

  zoomOut(): void {
    this.setZoom(String((this.transform().scale ?? 1) - this.ZOOM_STEP));
  }

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

      if (dataUrl !== this.lastDataUrl) {
        this.lastDataUrl = dataUrl;
        this.originalSize.set(null);
        this.displayedSize.set(null);
        this.transform.set({ scale: 1, translateH: 0, translateV: 0 });
        this.isPanelOpen.set(false);
      }

      this.restoreTarget.set(untracked(this.storedCrop));
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
    const crop = this.restoreTarget();
    const original = this.originalSize();
    const displayed = this.displayedSize();
    if (!crop || !original || !displayed) {
      return undefined;
    }
    return scaleCropToDisplay(crop, original, displayed);
  });

  /** `(imageLoaded)`: liefert die Originalgroesse fuer `cropperInput`. */
  onImageLoaded(image: LoadedImage): void {
    this.originalSize.set(image.original.size);
    this.imageLoadedEvent.emit();
  }

  /** `(cropperReady)`: liefert die Anzeigegroesse fuer `cropperInput`. */
  onCropperReady(dimensions: Dimensions): void {
    this.displayedSize.set(dimensions);
  }

  onCropped(event: ImageCroppedEvent): void {
    // Die Bibliothek erzeugt fuer jede Zuschnitt-Geste eine Object-URL des
    // gerenderten Vorschaubildes (`objectUrl`). Gebraucht wird hier nur
    // `imagePosition`, das gerenderte Bild selbst nie - ungenutzt bliebe die
    // URL sonst dauerhaft im Speicher stehen, bei jedem Ziehen am Rahmen neu.
    if (event.objectUrl) URL.revokeObjectURL(event.objectUrl);
    if (this.disabled()) return;

    // imagePosition ist in Pixeln des Originalbildes. So bleibt der
    // gespeicherte Zuschnitt unabhaengig von der Fenstergroesse.
    const p = event.imagePosition;
    const crop: Rect = {
      x: p.x1,
      y: p.y1,
      width: p.x2 - p.x1,
      height: p.y2 - p.y1,
    };

    this.cropChanged.emit(crop);
  }

  onTransform(transform: ImageTransform): void {
    this.transform.set({ ...transform, scale: clampZoom(transform.scale ?? 1) });
  }

  setZoom(value: string): void {
    const scale = clampZoom(Number(value));
    this.transform.update((current) => ({ ...current, scale }));
  }

  center(): void {
    this.transform.update((current) => ({ ...current, translateH: 0, translateV: 0 }));
  }

  reset(): void {
    this.transform.set({ scale: 1, translateH: 0, translateV: 0 });
    const original = this.originalSize();
    if (!original) return;
    this.restoreTarget.set(
      deriveRect({ x: 0, y: 0, width: original.width, height: original.height }, this.ratio()),
    );
  }
}
