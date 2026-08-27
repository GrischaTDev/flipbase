import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import {
  LucideBookOpen as BookOpen,
  LucideCircleHelp as CircleHelp,
  LucideDynamicIcon,
  LucideCheck as Check,
  LucideX as X,
} from '@lucide/angular';
import {
  Size,
  PLATFORM_PROFILES,
  PlatformProfile,
  PlatformId,
  Rect,
} from './models/platform-profile';
import { CropEditorComponent } from './components/crop-editor/crop-editor.component';
import { PlatformPreviewComponent } from './components/platform-preview/platform-preview.component';
import { ImageListComponent } from './components/image-list/image-list.component';
import { PhotoGuideComponent } from './components/photo-guide/photo-guide.component';
import { ImageExportService, fileName } from './services/image-export.service';
import { ZipExportService, folderName } from './services/zip-export.service';
import { setCrop, applyCropToAll, Crops } from './services/crops';
import { KeyedQueue } from './services/async-queue';
import { createExportSnapshot, replaceIfCurrent } from './services/async-state';
import { PhotoGuideState } from './services/photo-guide-state';
import { findResolutionIssue, checkOutput } from './services/platform-validation';
import { ToastService } from '../../shared/components/toast/toast.service';

/**
 * Hinweistext fuer Bilder, die der Browser nicht als Bild dekodieren kann -
 * typischerweise HEIC-Fotos vom iPhone. An genau dieser einen Stelle
 * definiert und sowohl beim Lesen (ueber das `loadFailed`-Ereignis des
 * Editors) als auch beim Export (`loadImage`) referenziert, damit die beiden
 * Meldungen nie auseinanderlaufen koennen.
 */
export const HEIC_HINT =
  'Das Bild liess sich nicht lesen. HEIC-Dateien vom iPhone kann der Browser oft nicht öffnen.';

/**
 * Hinweistext fuer alle uebrigen Formate, die sich nicht anzeigen liessen.
 *
 * Wichtig, dass es diesen zweiten Text gibt: Ein Fehlschlag bei einer PNG- oder
 * JPEG-Datei mit "HEIC-Dateien vom iPhone" zu erklaeren schickt den Nutzer in
 * die voellig falsche Richtung - genau das ist im Betrieb passiert.
 */
export const READ_HINT =
  'Das Bild liess sich nicht anzeigen. Versuche es mit einer anderen Datei oder speichere es vorher als JPEG.';

/** Ob eine Datei ein HEIC/HEIF-Foto ist - danach richtet sich der Hinweistext. */
export function isHeic(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return type.includes('heic') || type.includes('heif') || /\.(heic|heif)$/.test(name);
}

/** Ein hochgeladenes Bild mit seinen plattformspezifischen Zuschnitten. */
export interface OptimizerImage {
  readonly id: string;
  readonly file: File;
  readonly dataUrl: string;
  /** Zuschnitt je Plattform, in Originalpixeln. Leer, solange nichts gesetzt wurde. */
  readonly crops: Crops;
  /**
   * Viertelumdrehungen im Uhrzeigersinn, bereits in `dataUrl` eingebrannt.
   * `dataUrl` zeigt also immer das fertig gedrehte Bild - Editor, Vorschauen
   * und der Export muessen selbst nichts von einer Drehung wissen.
   */
  readonly rotation: 0 | 1 | 2 | 3;
  /**
   * Hinweis, falls der Cropper dieses Bild beim Lesen nicht anzeigen konnte
   * (siehe `HEIC_HINT`). Null, solange das Lesen nicht fehlgeschlagen ist.
   */
  readonly loadError: string | null;
  /**
   * Groesse von `dataUrl` in Originalpixeln, ermittelt kurz nach dem Lesen
   * (bzw. neu nach jeder Drehung, weil sich Breite und Hoehe dabei tauschen
   * koennen). Dient als Ersatz-Ausschnitt (volles Bild) fuer Bilder, die der
   * Nutzer nie im Editor geoeffnet und deshalb nie zugeschnitten hat - ohne
   * das blieben Warnungen und Export fuer diese Bilder blind. Null, solange
   * die Groesse noch nicht bekannt ist (z.B. HEIC oder eine noch laufende
   * Ermittlung).
   */
  readonly naturalSize: Size | null;
}

/**
 * Das volle Bild als Ersatz fuer Plattformen ohne eigenen Zuschnitt. Null
 * nur, solange die natuerliche Groesse noch nicht bekannt ist.
 */
function fullImageRect(image: OptimizerImage): Rect | null {
  if (!image.naturalSize) return null;
  return { x: 0, y: 0, width: image.naturalSize.width, height: image.naturalSize.height };
}

/**
 * Bereitet Produktfotos fuer die Verkaufsplattformen auf.
 *
 * Alles laeuft im Browser: Die Dateien werden nur gelesen, nichts wird
 * hochgeladen. Deshalb funktioniert das Werkzeug auch ohne Anmeldung am
 * Server und liesse sich spaeter eigenstaendig veroeffentlichen.
 */
@Component({
  selector: 'app-image-optimizer',
  imports: [
    LucideDynamicIcon,
    CropEditorComponent,
    PlatformPreviewComponent,
    ImageListComponent,
    PhotoGuideComponent,
  ],
  templateUrl: './image-optimizer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageOptimizerComponent {
  private readonly toast = inject(ToastService);
  private readonly imageExport = inject(ImageExportService);
  private readonly zipExport = inject(ZipExportService);
  private readonly rotationQueue = new KeyedQueue<string>();
  private destroyed = false;

  readonly profile = PLATFORM_PROFILES;

  readonly checkIcon = Check;
  readonly bookIcon = BookOpen;
  readonly helpIcon = CircleHelp;
  readonly xIcon = X;
  readonly photoGuide = new PhotoGuideState();

  readonly images = signal<OptimizerImage[]>([]);
  readonly selectedPlatformIds = signal<PlatformId[]>(['ebay']);
  readonly activeImageId = signal<string | null>(null);

  /** Die Plattform, fuer die der Editor gerade einen Zuschnitt bearbeitet. */
  readonly workingPlatformId = signal<PlatformId | null>('ebay');

  readonly isBusy = signal(false);
  readonly rotationsPending = computed(() => this.rotationQueue.pendingCount() > 0);
  readonly error = signal<string | null>(null);

  readonly selectedPlatforms = computed<PlatformProfile[]>(() =>
    this.profile.filter((p) => this.selectedPlatformIds().includes(p.id)),
  );

  readonly activeImage = computed<OptimizerImage | null>(
    () => this.images().find((b) => b.id === this.activeImageId()) ?? null,
  );

  /** Faellt auf die erste gewaehlte Plattform zurueck, falls die aktive entfaellt. */
  readonly workingPlatform = computed<PlatformProfile | null>(() => {
    const selected = this.selectedPlatforms();
    if (selected.length === 0) return null;

    const active = selected.find((p) => p.id === this.workingPlatformId());
    return active ?? selected[0];
  });

  /** Der Zuschnitt des aktiven Bildes fuer die aktive Plattform. */
  readonly activeCrop = computed<Rect | null>(() => {
    const image = this.activeImage();
    const platform = this.workingPlatform();
    if (!image || !platform) return null;
    return image.crops[platform.id] ?? null;
  });

  readonly activeOutputCheck = computed(() => {
    const image = this.activeImage();
    const platform = this.workingPlatform();
    if (!image || !platform) return null;
    return checkOutput(image.crops[platform.id] ?? null, image.naturalSize, platform);
  });

  readonly resolutionIssue = computed(() =>
    findResolutionIssue(
      this.images().map((image) => ({
        name: image.file.name,
        naturalSize: image.naturalSize,
        crops: image.crops,
      })),
      this.selectedPlatforms(),
    ),
  );

  constructor() {
    // `removeImage()` gibt die Object-URL eines Bildes frei, sobald es aus der
    // Liste geloescht wird - verlaesst der Nutzer die Seite aber vorher,
    // bleiben alle noch geladenen Fotos in vollem Original in Erinnerung.
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      for (const image of this.images()) {
        URL.revokeObjectURL(image.dataUrl);
      }
    });
  }

  togglePlatform(id: PlatformId): void {
    if (this.isBusy()) return;

    const before = this.selectedPlatformIds();
    const willBeSelected = !before.includes(id);

    // Mindestens ein Exportziel bleibt immer gewaehlt. Im Template ist der
    // entsprechende Kreuz-Knopf zusaetzlich gar nicht erst sichtbar.
    if (!willBeSelected && before.length === 1) return;

    this.selectedPlatformIds.update((ids) =>
      ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id],
    );

    if (!willBeSelected) {
      if (this.workingPlatformId() === id) {
        this.workingPlatformId.set(this.selectedPlatformIds()[0] ?? null);
      }
      return;
    }

    // Neu dazugewaehlt: aus dem bisherigen Arbeitsziel ableiten, damit fuer
    // bereits bearbeitete Bilder nicht unbemerkt das Vollbild exportiert wird.
    const source = this.workingPlatform();
    if (!source) return;

    const selected = this.selectedPlatforms();
    this.images.update((list) =>
      list.map((b) => {
        const rect = b.crops[source.id];
        if (!rect) return b;
        return {
          ...b,
          crops: setCrop(b.crops, source.id, rect, selected),
        };
      }),
    );
  }

  /** Waehlt eine Plattform bei Bedarf aus und setzt sie immer als Arbeitsziel. */
  selectWorkingPlatform(id: PlatformId): void {
    if (this.isBusy()) return;

    if (!this.selectedPlatformIds().includes(id)) {
      this.togglePlatform(id);
    }
    this.workingPlatformId.set(id);
  }

  setActiveImage(id: string): void {
    if (this.isBusy()) return;
    this.activeImageId.set(id);
  }

  async addFiles(files: FileList | null): Promise<void> {
    if (this.isBusy() || !files) return;

    const newImages: OptimizerImage[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      newImages.push({
        id: crypto.randomUUID(),
        file: file,
        dataUrl: URL.createObjectURL(file),
        crops: {},
        rotation: 0,
        loadError: null,
        naturalSize: null,
      });
    }

    this.images.update((list) => [...list, ...newImages]);
    if (!this.activeImageId() && newImages.length > 0) {
      this.activeImageId.set(newImages[0].id);
    }

    for (const image of newImages) {
      void this.measureNaturalSize(image.id, image.dataUrl);
    }
  }

  /**
   * Liest Breite und Hoehe von `dataUrl` und traegt sie in `naturalSize`
   * ein - fuer Bilder, die der Nutzer (noch) nicht im Editor geoeffnet hat,
   * ist das die einzige Quelle fuer eine Aufloesungswarnung oder einen
   * sinnvollen Export-Ausschnitt.
   *
   * Schlaegt das Lesen fehl (z.B. HEIC), bleibt `naturalSize` einfach null -
   * der Hinweis dazu erscheint bereits, sobald der Nutzer das Bild oeffnet
   * (siehe `onLoadFailed`), hier muss nichts zusaetzlich gemeldet
   * werden.
   *
   * Der Abgleich `b.dataUrl === dataUrl` schuetzt vor einer veralteten
   * Antwort: Wurde das Bild zwischenzeitlich gedreht, hat `dataUrl` sich
   * schon geaendert und `rotate()` bereits eine frische `naturalSize`
   * gesetzt - die hier noch laufende Messung des alten Standes darf die
   * neue nicht ueberschreiben. Die immutable Aktualisierung darf auch waehrend
   * eines Exports fertig werden: Dessen zuvor kopierter Snapshot bleibt davon
   * unberuehrt, waehrend die ermittelte Groesse fuer spaetere Exporte erhalten
   * bleibt.
   */
  private async measureNaturalSize(id: string, dataUrl: string): Promise<void> {
    try {
      const element = await this.loadImage(dataUrl);
      this.images.update((list) =>
        list.map((b) =>
          b.id === id && b.dataUrl === dataUrl
            ? { ...b, naturalSize: { width: element.naturalWidth, height: element.naturalHeight } }
            : b,
        ),
      );
    } catch {
      // Siehe Kommentar oben - bewusst kein Fehlerpfad hier.
    }
  }

  removeImage(id: string): void {
    if (this.isBusy()) return;

    const found = this.images().find((b) => b.id === id);
    if (found) URL.revokeObjectURL(found.dataUrl);

    this.images.update((list) => list.filter((b) => b.id !== id));
    if (this.activeImageId() === id) {
      this.activeImageId.set(this.images()[0]?.id ?? null);
    }
  }

  saveCrop(id: string, rect: Rect): void {
    if (this.isBusy()) return;

    const platform = this.workingPlatform();
    if (!platform) return;

    this.images.update((list) =>
      list.map((b) =>
        b.id === id
          ? {
              ...b,
              crops: setCrop(b.crops, platform.id, rect, this.selectedPlatforms()),
            }
          : b,
      ),
    );
  }

  /** Uebertraegt den aktiven Zuschnitt auf alle anderen gewaehlten Plattformen. */
  applyToAll(id: string): void {
    if (this.isBusy()) return;

    const platform = this.workingPlatform();
    if (!platform) return;

    this.images.update((list) =>
      list.map((b) =>
        b.id === id
          ? {
              ...b,
              crops: applyCropToAll(b.crops, platform.id, this.selectedPlatforms()),
            }
          : b,
      ),
    );
  }

  /**
   * `(loadFailed)` vom Editor: Der Cropper konnte dieses Bild nicht
   * anzeigen (typischerweise HEIC). Zeigt den Hinweis sofort direkt am
   * betroffenen Bild, statt den leeren Editor stehen zu lassen und erst beim
   * Export ueberhaupt zu bemerken, dass etwas fehlt.
   */
  onLoadFailed(id: string): void {
    if (this.isBusy()) return;

    this.images.update((list) =>
      list.map((b) =>
        b.id === id ? { ...b, loadError: isHeic(b.file) ? HEIC_HINT : READ_HINT } : b,
      ),
    );
  }

  /**
   * `(imageLoadedEvent)` vom Editor: Das Bild liess sich doch anzeigen.
   *
   * Ohne dieses Zuruecksetzen bleibt ein einmal gemeldeter Lesefehler fuer
   * dieses Bild fuer immer stehen - auch nach einer Drehung oder einem
   * erneuten Laden, bei dem alles funktioniert. Im Betrieb stand deshalb eine
   * Fehlermeldung ueber einem Bild, das sichtbar in Ordnung war.
   */
  onImageLoaded(id: string): void {
    this.images.update((list) =>
      list.map((b) => (b.id === id && b.loadError ? { ...b, loadError: null } : b)),
    );
  }

  /**
   * Dreht ein Bild um eine weitere Viertelumdrehung im Uhrzeigersinn.
   *
   * Gerendert wird immer aus `file`, der unveraenderten Originaldatei - nie
   * aus dem zuletzt gedrehten `dataUrl`. Wuerde man von der vorherigen
   * Drehung ausgehen, wuerde jede weitere Drehung erneut als JPEG kodieren
   * und das Bild verlöre bei mehrfachem Drehen sichtbar an Qualitaet.
   */
  async rotate(id: string): Promise<void> {
    if (this.isBusy() || this.destroyed) return;

    return this.rotationQueue.enqueue(id, async () => {
      // Der Drehstand wird absichtlich erst bei Ausfuehrung gelesen. Dadurch
      // baut jede wartende Drehung auf dem Ergebnis ihrer Vorgaengerin auf.
      if (this.isBusy() || this.destroyed) return;
      const image = this.images().find((entry) => entry.id === id);
      if (!image) return;

      const originalUrl = image.dataUrl;
      const newRotation = ((image.rotation + 1) % 4) as 0 | 1 | 2 | 3;

      try {
        const { dataUrl, size } = await this.rotateFile(image.file, newRotation);

        // Eine vor Exportstart begonnene Drehung darf den bereits erstellten
        // Snapshot und den waehrenddessen gesperrten Live-Zustand nicht mehr
        // veraendern. Ihre neu erzeugte URL wird sofort freigegeben.
        if (this.isBusy() || this.destroyed) {
          URL.revokeObjectURL(dataUrl);
          return;
        }

        let replacedUrl: string | null = null;
        let applied = false;
        this.images.update((list) => {
          const result = replaceIfCurrent(list, id, originalUrl, (current) => ({
            ...current,
            dataUrl: dataUrl,
            rotation: newRotation,
            // Ein vor der Drehung gezogener Ausschnitt bezieht sich auf
            // die ungedrehte Geometrie und wird deshalb verworfen.
            crops: {},
            naturalSize: size,
          }));
          replacedUrl = result.replacedUrl;
          applied = result.applied;
          return result.list;
        });

        if (applied && replacedUrl) {
          URL.revokeObjectURL(replacedUrl);
        } else {
          // Das Bild wurde entfernt oder bereits durch einen neueren Stand
          // ersetzt. Das unbenutzte Drehergebnis darf nicht im Speicher bleiben.
          URL.revokeObjectURL(dataUrl);
        }
      } catch (e: unknown) {
        if (!this.isBusy() && !this.destroyed) {
          this.error.set(e instanceof Error ? e.message : 'Das Bild liess sich nicht drehen.');
        }
      }
    });
  }

  /**
   * Rendert `file` um `quarterTurns` Viertelumdrehungen im Uhrzeigersinn gedreht
   * in eine neue Zeichenflaeche und liefert die Object-URL des Ergebnisses
   * zusammen mit der resultierenden Groesse. Bei einer ungeraden Anzahl
   * Viertelumdrehungen tauschen Breite und Hoehe der Zeichenflaeche
   * gegenueber dem Original.
   */
  private async rotateFile(
    file: File,
    quarterTurns: 0 | 1 | 2 | 3,
  ): Promise<{ dataUrl: string; size: Size }> {
    const source = await this.loadOriginalFile(file);
    const width = source.width;
    const height = source.height;
    const sidesSwapped = quarterTurns % 2 === 1;

    const canvas = document.createElement('canvas');
    canvas.width = sidesSwapped ? height : width;
    canvas.height = sidesSwapped ? width : height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Der Browser stellt keine Zeichenflaeche bereit.');

    // Weisser Grund: wie beim Export bliebe sonst ein durchsichtiger
    // PNG-Bereich als Schwarz stehen, sobald als JPEG kodiert wird.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';

    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((quarterTurns * 90 * Math.PI) / 180);
    context.drawImage(source, -width / 2, -height / 2, width, height);

    if (source instanceof ImageBitmap) source.close();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Das gedrehte Bild liess sich nicht erzeugen.'))),
        'image/jpeg',
        0.92,
      );
    });

    return {
      dataUrl: URL.createObjectURL(blob),
      size: { width: canvas.width, height: canvas.height },
    };
  }

  /**
   * Laedt die Originaldatei als zeichenbare Quelle fuer die Zeichenflaeche.
   * `createImageBitmap` wird bevorzugt (dekodiert ausserhalb des UI-Threads);
   * ohne diese API dient ein `<img>` an einer eigenen, danach wieder
   * freigegebenen Object-URL als Rueckfallebene.
   */
  private async loadOriginalFile(file: File): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file);
    }

    const url = URL.createObjectURL(file);
    try {
      return await this.loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Schiebt ein Bild in der Reihenfolge. Position 0 ist das Hauptbild. */
  moveImage(id: string, direction: -1 | 1): void {
    if (this.isBusy()) return;

    this.images.update((list) => {
      const from = list.findIndex((b) => b.id === id);
      const to = from + direction;
      if (from === -1 || to < 0 || to >= list.length) return list;

      const updated = [...list];
      [updated[from], updated[to]] = [updated[to], updated[from]];
      return updated;
    });
  }

  async exportImages(): Promise<void> {
    if (this.isBusy() || this.rotationsPending() || this.resolutionIssue()) return;

    this.isBusy.set(true);
    this.error.set(null);
    const snapshot = createExportSnapshot(this.images(), this.selectedPlatforms());

    try {
      const entries = [];

      for (const [index, image] of snapshot.images.entries()) {
        const element = await this.loadImage(image.dataUrl);
        // Letzte Absicherung, falls `naturalSize` unmittelbar nach dem
        // Hochladen noch nicht ermittelt wurde.
        const fallback = fullImageRect(image) ?? {
          x: 0,
          y: 0,
          width: element.naturalWidth,
          height: element.naturalHeight,
        };

        for (const p of snapshot.profile) {
          const crop = image.crops[p.id] ?? fallback;
          const check = checkOutput(crop, null, p);
          if (check && !check.isValid) {
            throw new Error(
              `${image.file.name} ist für ${p.name} mit ${check.width} × ${check.height} px zu klein.`,
            );
          }
          entries.push({
            folder: folderName(p),
            file: fileName(index, p),
            data: await this.imageExport.create(element, crop, p),
          });
        }
      }

      const archive = await this.zipExport.pack(entries);
      this.download(archive, 'flipbase-bilder.zip');
      this.toast.success('Bilder wurden exportiert.');
    } catch (e: unknown) {
      const description = e instanceof Error ? e.message : 'Der Export ist fehlgeschlagen.';
      this.error.set(description);
      this.toast.error('Bilder konnten nicht exportiert werden.', description);
    } finally {
      this.isBusy.set(false);
    }
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(HEIC_HINT));
      image.src = url;
    });
  }

  private download(data: Blob, name: string): void {
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }
}
