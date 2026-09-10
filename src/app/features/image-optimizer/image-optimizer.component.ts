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
import {
  PLATFORM_PROFILES,
  PlatformProfile,
  PlatformId,
  Rect,
  Size,
} from './models/platform-profile';
import { OptimizerImage, fullImageRect } from './models/optimizer-image';
import { Adjustments } from './models/image-adjustments';
import { pendingMetadata } from './models/image-metadata';
import { defaultAdjustments, looksEqual, toLook } from './services/adjustments';
import { MetadataReaderService } from './services/metadata-reader.service';
import { CropEditorComponent } from './components/crop-editor/crop-editor.component';
import { PreviewGridComponent } from './components/preview-grid/preview-grid.component';
import { AdjustmentControlsComponent } from './components/adjustment-controls/adjustment-controls.component';
import { MetadataPanelComponent } from './components/metadata-panel/metadata-panel.component';
import { ImageListComponent } from './components/image-list/image-list.component';
import { PhotoGuideComponent } from './components/photo-guide/photo-guide.component';
import { PlatformSelectorComponent } from './components/platform-selector/platform-selector.component';
import { PlatformTabsComponent } from './components/platform-tabs/platform-tabs.component';
import { DropZoneComponent } from './components/drop-zone/drop-zone.component';
import { OptimizerHeaderComponent } from './components/optimizer-header/optimizer-header.component';
import { ExportBarComponent, ExportStatus } from './components/export-bar/export-bar.component';
import { FileDropDirective, splitImageFiles } from './directives/file-drop.directive';
import { ImageExportService } from './services/image-export.service';
import { ZipExportService, folderName } from './services/zip-export.service';
import {
  canWriteDirectory,
  DirectoryExportService,
  ExportEntry,
} from './services/directory-export.service';
import {
  archiveName,
  effectiveBaseName,
  exportFileName,
  sanitizeBaseName,
} from './services/file-name';
import { setCrop, seedCrops } from './services/crops';
import { KeyedQueue } from './services/async-queue';
import { createExportSnapshot, replaceIfCurrent } from './services/async-state';
import {
  removeImage as removeImageFrom,
  removeAll,
  moveImage as moveImageIn,
  saveCropIn,
  applyCropToAllIn,
  markReviewed,
  toggleReviewed as toggleReviewedIn,
  reviewedCount as countReviewed,
  setAdjustmentsIn,
  applyAdjustmentsToAll,
} from './services/image-collection';
import { ImageRotationService } from './services/image-rotation.service';
import { PhotoGuideState } from './services/photo-guide-state';
import { findResolutionIssue, checkOutput } from './services/platform-validation';
import { togglePlatformIn } from './services/platform-selection';
import { ToastService } from '../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog/confirm-dialog.service';
import { createLocalDemoId } from '../../core/utils/client-identity';

/**
 * Hinweistext fuer Bilder, die der Browser nicht als Bild dekodieren kann -
 * typischerweise HEIC-Fotos vom iPhone. An genau dieser einen Stelle
 * definiert und sowohl beim Lesen (ueber das `loadFailed`-Ereignis des
 * Editors) als auch beim Export (`loadImage`, wenn die betroffene Datei
 * tatsaechlich HEIC ist) referenziert, damit die beiden Meldungen fuer
 * denselben Fall nie auseinanderlaufen koennen.
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
    DropZoneComponent,
    OptimizerHeaderComponent,
    ExportBarComponent,
    FileDropDirective,
    AdjustmentControlsComponent,
    MetadataPanelComponent,
  ],
  templateUrl: './image-optimizer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageOptimizerComponent {
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly imageExport = inject(ImageExportService);
  private readonly zipExport = inject(ZipExportService);
  private readonly directoryExport = inject(DirectoryExportService);
  private readonly rotation = inject(ImageRotationService);
  private readonly metadataReader = inject(MetadataReaderService);
  private readonly rotationQueue = new KeyedQueue<string>();
  private destroyed = false;

  readonly profiles = PLATFORM_PROFILES;

  readonly bookIcon = BookOpen;
  readonly helpIcon = CircleHelp;
  readonly photoGuide = new PhotoGuideState();

  readonly images = signal<OptimizerImage[]>([]);
  readonly selectedPlatformIds = signal<readonly PlatformId[]>([]);
  readonly activeImageId = signal<string | null>(null);

  /** Rohe Eingabe des Grundnamens; {@link baseName} liefert die entschaerfte Fassung. */
  readonly baseNameInput = signal('');
  readonly baseName = computed(() => sanitizeBaseName(this.baseNameInput()));

  /** Die Plattform, fuer die der Editor gerade einen Zuschnitt bearbeitet. */
  readonly workingPlatformId = signal<PlatformId | null>(null);

  readonly isBusy = signal(false);
  readonly rotationsPending = computed(() => this.rotationQueue.pendingCount() > 0);
  readonly error = signal<string | null>(null);
  readonly isDragActive = signal(false);

  /**
   * Wie viele Dateien fertig sind, waehrend ein Export laeuft, und in welcher
   * Phase: `render` erzeugt die Dateien (dauert bei vielen Bildern und
   * Plattformen am laengsten), `write` speichert sie danach in den Ordner.
   * Beim ZIP-Pfad gibt es nur die Render-Phase - dort wird nichts geschrieben.
   */
  readonly exportProgress = signal<{
    done: number;
    total: number;
    phase: 'render' | 'write';
  } | null>(null);

  readonly selectedPlatforms = computed<PlatformProfile[]>(() =>
    this.profiles.filter((p) => this.selectedPlatformIds().includes(p.id)),
  );

  readonly activeImage = computed<OptimizerImage | null>(
    () => this.images().find((b) => b.id === this.activeImageId()) ?? null,
  );

  /**
   * Bildwirkung des aktiven Bildes fuer die Exportvorschau.
   *
   * Der eigene Vergleich ist wichtig: `computed` prueft sonst mit `Object.is`,
   * und ein jedes Mal neu gebautes Objekt gilt damit immer als geaendert. Die
   * Vorschau wuerde bei jeder Aenderung an der Bilderliste neu rendern - auch
   * beim blossen Umschalten der Marke "durchgesehen".
   */
  readonly activeLook = computed(
    () => {
      const image = this.activeImage();
      return toLook(image ? image.adjustments : defaultAdjustments());
    },
    { equal: looksEqual },
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

  readonly reviewedCount = computed(() => countReviewed(this.images()));

  /**
   * Welcher Hinweis in der Exportleiste erscheint. Die Entscheidung faellt
   * hier in der Smart Component, damit die Exportleiste selbst frei von
   * Fallunterscheidungen bleibt.
   */
  readonly exportStatus = computed<ExportStatus>(() => {
    const progress = this.exportProgress();
    if (progress) {
      // Beide Phasen zaehlen Dateien, nicht Bilder: Ein Bild fuer drei
      // Plattformen sind drei Dateien. Der Wortlaut unterscheidet die Phasen,
      // damit der Verkaeufer erkennt, ob gerade erzeugt oder gespeichert wird.
      const verb = progress.phase === 'render' ? 'wird erstellt' : 'wird gespeichert';
      return {
        kind: 'progress',
        title: `Datei ${progress.done} von ${progress.total} ${verb}`,
        detail: null,
      };
    }

    const image = this.activeImage();
    if (image?.loadError) return { kind: 'error', title: image.loadError, detail: null };

    const issue = this.resolutionIssue();
    if (issue) {
      return {
        kind: 'error',
        title: `${issue.imageName} ist für ${issue.platformName} mit ${issue.width} × ${issue.height} px zu klein.`,
        detail: null,
      };
    }

    const failure = this.error();
    if (failure) return { kind: 'error', title: failure, detail: null };

    if (this.selectedPlatforms().length === 0) {
      // Die ausfuehrliche Erklaerung dazu steht bereits im Editorbereich
      // (siehe Template); hier reicht der kurze Titel, um die Meldung nicht
      // zweimal mit unterschiedlichem Wortlaut zu zeigen.
      return { kind: 'error', title: 'Noch keine Plattform gewählt', detail: null };
    }

    return {
      kind: 'ready',
      title: 'Bereit für den Export',
      detail: 'JPEG mit hoher Qualität, sortiert nach Plattform.',
    };
  });

  readonly canExport = computed(
    () =>
      !this.rotationsPending() &&
      this.selectedPlatforms().length > 0 &&
      this.images().length > 0 &&
      this.resolutionIssue() === null,
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
              crops: setCrop(
                image.crops,
                inheritFrom,
                image.crops[inheritFrom]!,
                selected,
                image.naturalSize,
              ),
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
    this.activateImage(id);
  }

  /** Setzt das aktive Bild und markiert es als durchgesehen. */
  private activateImage(id: string): void {
    this.activeImageId.set(id);
    this.images.update((list) => [...markReviewed(list, id)]);
  }

  /** Schaltet die Markierung "durchgesehen" fuer ein Bild von Hand um. */
  toggleReviewed(id: string): void {
    if (this.isBusy()) return;
    this.images.update((list) => [...toggleReviewedIn(list, id)]);
  }

  addFiles(files: readonly File[]): void {
    if (this.isBusy() || files.length === 0) return;

    const { images, skipped } = splitImageFiles(files);

    if (skipped > 0) {
      const text = skipped === 1 ? '1 Datei übersprungen' : `${skipped} Dateien übersprungen`;
      if (images.length === 0) {
        this.toast.warning('Keine Bilder dabei', `${text}, weil es keine Bilder sind.`);
      } else {
        this.toast.info('Nicht alles war ein Bild', `${text}, weil es keine Bilder sind.`);
      }
    }
    if (images.length === 0) return;

    const added: OptimizerImage[] = images.map((file) => ({
      id: createLocalDemoId('image'),
      file,
      dataUrl: URL.createObjectURL(file),
      crops: {},
      rotation: 0,
      loadError: null,
      naturalSize: null,
      reviewed: false,
      adjustments: defaultAdjustments(),
      metadata: pendingMetadata(),
    }));

    this.images.update((list) => [...list, ...added]);
    if (!this.activeImageId() && added.length > 0) {
      this.activateImage(added[0].id);
    }

    for (const image of added) {
      void this.measureNaturalSize(image.id, image.dataUrl);
      void this.readMetadata(image.id, image.file);
    }
  }

  /**
   * Traegt eine ermittelte Bildgroesse ein und belegt die Zuschnitte damit vor.
   *
   * Oeffentlich, damit sich die Vorbelegung ohne ein `Image`-Element pruefen
   * laesst: `measureNaturalSize` wartet auf dessen `load`, und das kommt unter
   * jsdom nie. Ohne diesen Einstieg waere die Regel, die den zu kleinen
   * Vinted-Rahmen behebt, nur von Hand im Browser nachweisbar.
   *
   * Der Abgleich `image.dataUrl === dataUrl` schuetzt vor einer veralteten
   * Antwort. Der einzige produktive Aufrufer, `measureNaturalSize`, uebergibt
   * `dataUrl` deshalb immer; das Argument ist nur optional, damit ein Test
   * die Vorbelegung auch ohne `dataUrl` ansteuern kann.
   */
  applyNaturalSize(id: string, size: Size, dataUrl?: string): void {
    const selected = this.selectedPlatforms();
    this.images.update((list) =>
      list.map((image) =>
        image.id === id && (dataUrl === undefined || image.dataUrl === dataUrl)
          ? { ...image, naturalSize: size, crops: seedCrops(size, selected) }
          : image,
      ),
    );
  }

  /**
   * Liest Breite und Hoehe von `dataUrl` und traegt sie ueber
   * {@link applyNaturalSize} ein - fuer Bilder, die der Nutzer (noch) nicht
   * im Editor geoeffnet hat, ist das die einzige Quelle fuer eine
   * Aufloesungswarnung oder einen sinnvollen Export-Ausschnitt.
   *
   * Schlaegt das Lesen fehl (z.B. HEIC), bleibt `naturalSize` einfach null -
   * der Hinweis dazu erscheint bereits, sobald der Nutzer das Bild oeffnet
   * (siehe `onLoadFailed`), hier muss nichts zusaetzlich gemeldet
   * werden.
   *
   * Die uebergebene `dataUrl` schuetzt vor einer veralteten Antwort: Wurde
   * das Bild zwischenzeitlich gedreht, hat `dataUrl` sich schon geaendert und
   * `rotate()` bereits eine frische `naturalSize` gesetzt - die hier noch
   * laufende Messung des alten Standes darf die neue nicht ueberschreiben.
   * Die immutable Aktualisierung darf auch waehrend eines Exports fertig
   * werden: Dessen zuvor kopierter Snapshot bleibt davon unberuehrt, waehrend
   * die ermittelte Groesse fuer spaetere Exporte erhalten bleibt.
   */
  private async measureNaturalSize(id: string, dataUrl: string): Promise<void> {
    try {
      const element = await this.loadImage(dataUrl);
      this.applyNaturalSize(
        id,
        { width: element.naturalWidth, height: element.naturalHeight },
        dataUrl,
      );
    } catch {
      // Siehe Kommentar oben - bewusst kein Fehlerpfad hier.
    }
  }

  /**
   * Liest die Metadaten im Hintergrund, nach demselben Muster wie die
   * Bildgroesse. Gelesen wird aus `file`: Die Originaldatei aendert sich nie,
   * also kann hier - anders als bei der Groesse - keine veraltete Antwort
   * einen neueren Stand ueberschreiben.
   */
  private async readMetadata(id: string, file: File): Promise<void> {
    const metadata = await this.metadataReader.read(file);
    this.images.update((list) =>
      list.map((image) => (image.id === id ? { ...image, metadata } : image)),
    );
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

  /**
   * Entfernt alle Bilder auf einmal - nach Rueckfrage, weil der Schritt nicht
   * umkehrbar ist. Plattformauswahl, Arbeitsziel und Grundname bleiben
   * bewusst stehen: Der naechste Artikel wird meist genauso exportiert.
   */
  async clearAllImages(): Promise<void> {
    if (this.isBusy() || this.images().length === 0) return;

    const count = this.images().length;
    const confirmed = await this.confirm.frage({
      titel: 'Alle Bilder entfernen?',
      text: `${count} Bild(er) werden aus dem Bildoptimierer entfernt. Die Dateien auf deinem Rechner bleiben unberührt. Bereits gesetzte Ausschnitte gehen verloren.`,
      bestaetigenText: 'Alle entfernen',
      gefahr: true,
    });
    if (!confirmed) return;

    const result = removeAll(this.images());
    this.images.set([...result.list]);
    result.revokedUrls.forEach((url) => URL.revokeObjectURL(url));
    this.activeImageId.set(null);
    this.error.set(null);

    this.toast.success('Alle Bilder wurden entfernt.');
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

        const selected = this.selectedPlatforms();
        let replacedUrl: string | null = null;
        let applied = false;
        this.images.update((list) => {
          const result = replaceIfCurrent(list, id, originalUrl, (current) => ({
            ...current,
            dataUrl: dataUrl,
            rotation: newRotation,
            // Ein vor der Drehung gezogener Ausschnitt bezieht sich auf
            // die ungedrehte Geometrie. Statt leer zu bleiben, wird mit dem
            // Maximum der gedrehten Groesse neu vorbelegt - sonst muesste
            // der Nutzer nach jeder Drehung von Hand aufziehen.
            crops: seedCrops(size, selected),
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

  setAdjustments(values: Adjustments): void {
    if (this.isBusy()) return;
    const id = this.activeImageId();
    if (!id) return;
    this.images.update((list) => [...setAdjustmentsIn(list, id, values)]);
  }

  resetAdjustments(): void {
    this.setAdjustments(defaultAdjustments());
  }

  /** Uebertraegt die Werte des aktiven Bildes auf alle Bilder - alle Fotos
   *  eines Artikels entstehen meist im selben Licht. */
  applyAdjustmentsToAllImages(): void {
    if (this.isBusy()) return;
    const image = this.activeImage();
    if (!image) return;
    this.images.update((list) => [...applyAdjustmentsToAll(list, image.adjustments)]);
    this.toast.success('Farbe und Belichtung wurden auf alle Bilder übernommen.');
  }

  /** Meldet den Fortschritt einer Phase; `null` beendet die Anzeige wieder. */
  reportExportProgress(
    done: number | null,
    total: number | null,
    phase: 'render' | 'write' = 'render',
  ): void {
    this.exportProgress.set(done === null || total === null ? null : { done, total, phase });
  }

  async exportImages(): Promise<void> {
    if (this.isBusy() || this.rotationsPending() || this.resolutionIssue()) return;

    this.isBusy.set(true);
    this.error.set(null);
    const snapshot = createExportSnapshot(this.images(), this.selectedPlatforms());
    // Einmal je Export, nicht je Datei: Sonst koennte ein Lauf ueber einen
    // Minutenwechsel hinweg zwei verschiedene Namen erzeugen.
    const name = effectiveBaseName(this.baseName(), new Date());

    try {
      const entries: ExportEntry[] = [];
      // Jedes Bild wird fuer jede gewaehlte Plattform einmal gerendert - das
      // ist die Gesamtzahl der Dateien, die diese Phase erzeugt.
      const renderTotal = snapshot.images.length * snapshot.profile.length;
      this.reportExportProgress(0, renderTotal, 'render');

      for (const [index, image] of snapshot.images.entries()) {
        const element = await this.loadImage(image.dataUrl, image.file);
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
            file: exportFileName(index, name),
            data: await this.imageExport.create(
              element,
              crop,
              p,
              toLook(image.adjustments),
              image.metadata.capturedAt,
            ),
          });
          // Das Rendern ist der eigentlich langsame Teil - genau hier fehlte
          // bisher jedes Lebenszeichen, gerade beim ZIP-Pfad ganz ohne Anzeige.
          this.reportExportProgress(entries.length, renderTotal, 'render');
        }
      }

      if (canWriteDirectory()) {
        this.reportExportProgress(0, entries.length, 'write');
        const result = await this.directoryExport.write(entries, name, (done, total) =>
          this.reportExportProgress(done, total, 'write'),
        );
        // Abbruch ist kein Fehler: keine Meldung, kein ZIP als Ersatz.
        if (result.outcome === 'cancelled') return;
        this.toast.success('Bilder wurden gespeichert.', `Ordner „${result.folder}“.`);
      } else {
        const archive = await this.zipExport.pack(entries);
        this.download(archive, archiveName(name));
        this.toast.success('Bilder wurden exportiert.');
      }
    } catch (e: unknown) {
      const description = e instanceof Error ? e.message : 'Der Export ist fehlgeschlagen.';
      this.error.set(description);
      this.toast.error('Bilder konnten nicht exportiert werden.', description);
    } finally {
      this.reportExportProgress(null, null);
      this.isBusy.set(false);
    }
  }

  /**
   * `file` ist nur beim Export bekannt (siehe `exportImages`); `measureNaturalSize`
   * hat keine Datei zur Hand und bekommt deshalb den allgemeineren Hinweis.
   */
  private loadImage(url: string, file?: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(file && isHeic(file) ? HEIC_HINT : READ_HINT));
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
