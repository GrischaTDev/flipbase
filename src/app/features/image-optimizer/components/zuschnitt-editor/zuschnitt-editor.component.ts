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
  LoadedImage,
} from 'ngx-image-cropper';
import { LucideDynamicIcon, LucideRotateCw as RotateCw } from '@lucide/angular';
import { Rechteck } from '../../models/plattform-profile';

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
    if (!ausschnitt || !original || !angezeigt || original.width === 0 || original.height === 0) {
      return undefined;
    }

    const breitenVerhaeltnis = angezeigt.width / original.width;
    const hoehenVerhaeltnis = angezeigt.height / original.height;

    return {
      x1: ausschnitt.x * breitenVerhaeltnis,
      y1: ausschnitt.y * hoehenVerhaeltnis,
      x2: (ausschnitt.x + ausschnitt.breite) * breitenVerhaeltnis,
      y2: (ausschnitt.y + ausschnitt.hoehe) * hoehenVerhaeltnis,
    };
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
}
