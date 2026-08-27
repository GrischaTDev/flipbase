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
} from '@lucide/angular';
import { PLATFORM_PROFILES, PlatformProfile, PlatformId, Rect } from './models/platform-profile';
import { OptimizerImage, fullImageRect } from './models/optimizer-image';
import { CropEditorComponent } from './components/crop-editor/crop-editor.component';
import { PreviewGridComponent } from './components/preview-grid/preview-grid.component';
import { ImageListComponent } from './components/image-list/image-list.component';
import { PhotoGuideComponent } from './components/photo-guide/photo-guide.component';
import { PlatformSelectorComponent } from './components/platform-selector/platform-selector.component';
import { PlatformTabsComponent } from './components/platform-tabs/platform-tabs.component';
import { ImageExportService, fileName } from './services/image-export.service';
import { ZipExportService, folderName } from './services/zip-export.service';
import { setCrop } from './services/crops';
import { KeyedQueue } from './services/async-queue';
import { createExportSnapshot, replaceIfCurrent } from './services/async-state';
import {
  removeImage as removeImageFrom,
  moveImage as moveImageIn,
  saveCropIn,
  applyCropToAllIn,
} from './services/image-collection';
import { ImageRotationService } from './services/image-rotation.service';
import { PhotoGuideState } from './services/photo-guide-state';
import { findResolutionIssue, checkOutput } from './services/platform-validation';
import { togglePlatformIn } from './services/platform-selection';
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
    PreviewGridComponent,
    ImageListComponent,
    PhotoGuideComponent,
    PlatformSelectorComponent,
    PlatformTabsComponent,
  ],
  templateUrl: './image-optimizer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageOptimizerComponent {
  private readonly toast = inject(ToastService);
  private readonly imageExport = inject(ImageExportService);
  private readonly zipExport = inject(ZipExportService);
  private readonly rotation = inject(ImageRotationService);
  private readonly rotationQueue = new KeyedQueue<string>();
  private destroyed = false;

  readonly profiles = PLATFORM_PROFILES;

  readonly bookIcon = BookOpen;
  readonly helpIcon = CircleHelp;
  readonly photoGuide = new PhotoGuideState();

  readonly images = signal<OptimizerImage[]>([]);
  readonly selectedPlatformIds = signal<readonly PlatformId[]>([]);
  readonly activeImageId = signal<string | null>(null);

  /** Die Plattform, fuer die der Editor gerade einen Zuschnitt bearbeitet. */
  readonly workingPlatformId = signal<PlatformId | null>(null);

  readonly isBusy = signal(false);
  readonly rotationsPending = computed(() => this.rotationQueue.pendingCount() > 0);
  readonly error = signal<string | null>(null);

  readonly selectedPlatforms = computed<PlatformProfile[]>(() =>
    this.profiles.filter((p) => this.selectedPlatformIds().includes(p.id)),
  );

  readonly activeImage = computed<OptimizerImage | null>(
    () => this.images().find((b) => b.id === this.activeImageId()) ?? null,
  );

  readonly workingPlatform = computed<PlatformProfile | null>(
    () => this.selectedPlatforms().find((p) => p.id === this.workingPlatformId()) ?? null,
  );

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

    const { state, inheritFrom } = togglePlatformIn(
      { selectedIds: this.selectedPlatformIds(), workingId: this.workingPlatformId() },
      id,
    );
    this.selectedPlatformIds.set(state.selectedIds);
    this.workingPlatformId.set(state.workingId);

    // Neu dazugewaehlt: aus dem bisherigen Arbeitsziel ableiten, damit fuer
    // bereits bearbeitete Bilder nicht unbemerkt das Vollbild exportiert wird.
    if (!inheritFrom) return;
    const selected = this.selectedPlatforms();
    this.images.update((list) =>
      list.map((image) =>
        image.crops[inheritFrom]
          ? {
              ...image,
              crops: setCrop(image.crops, inheritFrom, image.crops[inheritFrom]!, selected),
            }
          : image,
      ),
    );
  }

  setWorkingPlatform(id: PlatformId): void {
    if (this.isBusy()) return;
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
        reviewed: false,
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

    const result = removeImageFrom(this.images(), id);
    this.images.set([...result.list]);
    result.revokedUrls.forEach((url) => URL.revokeObjectURL(url));

    if (this.activeImageId() === id) {
      this.activeImageId.set(this.images()[0]?.id ?? null);
    }
  }

  saveCrop(id: string, rect: Rect): void {
    if (this.isBusy()) return;

    const platform = this.workingPlatform();
    if (!platform) return;

    this.images.set([
      ...saveCropIn(this.images(), id, platform.id, rect, this.selectedPlatforms()),
    ]);
  }

  /** Uebertraegt den aktiven Zuschnitt auf alle anderen gewaehlten Plattformen. */
  applyToAll(id: string): void {
    if (this.isBusy()) return;

    const platform = this.workingPlatform();
    if (!platform) return;

    this.images.set([
      ...applyCropToAllIn(this.images(), id, platform.id, this.selectedPlatforms()),
    ]);
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
        const { dataUrl, size } = await this.rotation.rotate(image.file, newRotation);

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

  /** Schiebt ein Bild in der Reihenfolge. Position 0 ist das Hauptbild. */
  moveImage(id: string, direction: -1 | 1): void {
    if (this.isBusy()) return;

    this.images.set([...moveImageIn(this.images(), id, direction)]);
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
