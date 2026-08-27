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
import { BildExportService, fileName } from './services/image-export.service';
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
 * definiert und sowohl beim Lesen (ueber das `loadImageFailed`-Ereignis des
 * Editors) als auch beim Export (`ladeBild`) referenziert, damit die beiden
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
export function isHeic(datei: File): boolean {
  const typ = (datei.type || '').toLowerCase();
  const name = (datei.name || '').toLowerCase();
  return typ.includes('heic') || typ.includes('heif') || /\.(heic|heif)$/.test(name);
}

/** Ein hochgeladenes Bild mit seinen plattformspezifischen Zuschnitten. */
export interface OptimizerImage {
  readonly id: string;
  readonly file: File;
  readonly dataUrl: string;
  /** Zuschnitt je Plattform, in Originalpixeln. Leer, solange nichts gesetzt wurde. */
  readonly crops: Crops;
  /**
   * Viertelumdrehungen im Uhrzeigersinn, bereits in `datenUrl` eingebrannt.
   * `datenUrl` zeigt also immer das fertig gedrehte Bild - Editor, Vorschauen
   * und der Export muessen selbst nichts von einer Drehung wissen.
   */
  readonly rotation: 0 | 1 | 2 | 3;
  /**
   * Hinweis, falls der Cropper dieses Bild beim Lesen nicht anzeigen konnte
   * (siehe `HEIC_HINWEIS`). Null, solange das Lesen nicht fehlgeschlagen ist.
   */
  readonly loadError: string | null;
  /**
   * Groesse von `datenUrl` in Originalpixeln, ermittelt kurz nach dem Lesen
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
function fullImageRect(bild: OptimizerImage): Rect | null {
  if (!bild.naturalSize) return null;
  return { x: 0, y: 0, width: bild.naturalSize.width, height: bild.naturalSize.height };
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
  private readonly bildExport = inject(BildExportService);
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
    const gewaehlt = this.selectedPlatforms();
    if (gewaehlt.length === 0) return null;

    const aktiv = gewaehlt.find((p) => p.id === this.workingPlatformId());
    return aktiv ?? gewaehlt[0];
  });

  /** Der Zuschnitt des aktiven Bildes fuer die aktive Plattform. */
  readonly activeCrop = computed<Rect | null>(() => {
    const bild = this.activeImage();
    const plattform = this.workingPlatform();
    if (!bild || !plattform) return null;
    return bild.crops[plattform.id] ?? null;
  });

  readonly activeOutputCheck = computed(() => {
    const bild = this.activeImage();
    const plattform = this.workingPlatform();
    if (!bild || !plattform) return null;
    return checkOutput(bild.crops[plattform.id] ?? null, bild.naturalSize, plattform);
  });

  readonly resolutionIssue = computed(() =>
    findResolutionIssue(
      this.images().map((bild) => ({
        name: bild.file.name,
        naturGroesse: bild.naturalSize,
        ausschnitte: bild.crops,
      })),
      this.selectedPlatforms(),
    ),
  );

  constructor() {
    // `entferne()` gibt die Object-URL eines Bildes frei, sobald es aus der
    // Liste geloescht wird - verlaesst der Nutzer die Seite aber vorher,
    // bleiben alle noch geladenen Fotos in vollem Original in Erinnerung.
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      for (const bild of this.images()) {
        URL.revokeObjectURL(bild.dataUrl);
      }
    });
  }

  togglePlatform(id: PlatformId): void {
    if (this.isBusy()) return;

    const vorher = this.selectedPlatformIds();
    const wirdGewaehlt = !vorher.includes(id);

    // Mindestens ein Exportziel bleibt immer gewaehlt. Im Template ist der
    // entsprechende Kreuz-Knopf zusaetzlich gar nicht erst sichtbar.
    if (!wirdGewaehlt && vorher.length === 1) return;

    this.selectedPlatformIds.update((ids) =>
      ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id],
    );

    if (!wirdGewaehlt) {
      if (this.workingPlatformId() === id) {
        this.workingPlatformId.set(this.selectedPlatformIds()[0] ?? null);
      }
      return;
    }

    // Neu dazugewaehlt: aus dem bisherigen Arbeitsziel ableiten, damit fuer
    // bereits bearbeitete Bilder nicht unbemerkt das Vollbild exportiert wird.
    const quelle = this.workingPlatform();
    if (!quelle) return;

    const gewaehlt = this.selectedPlatforms();
    this.images.update((liste) =>
      liste.map((b) => {
        const rechteck = b.crops[quelle.id];
        if (!rechteck) return b;
        return {
          ...b,
          crops: setCrop(b.crops, quelle.id, rechteck, gewaehlt),
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

  async addFiles(dateien: FileList | null): Promise<void> {
    if (this.isBusy() || !dateien) return;

    const neue: OptimizerImage[] = [];
    for (const datei of Array.from(dateien)) {
      if (!datei.type.startsWith('image/')) continue;
      neue.push({
        id: crypto.randomUUID(),
        file: datei,
        dataUrl: URL.createObjectURL(datei),
        crops: {},
        rotation: 0,
        loadError: null,
        naturalSize: null,
      });
    }

    this.images.update((liste) => [...liste, ...neue]);
    if (!this.activeImageId() && neue.length > 0) {
      this.activeImageId.set(neue[0].id);
    }

    for (const bild of neue) {
      void this.measureNaturalSize(bild.id, bild.dataUrl);
    }
  }

  /**
   * Liest Breite und Hoehe von `datenUrl` und traegt sie in `naturGroesse`
   * ein - fuer Bilder, die der Nutzer (noch) nicht im Editor geoeffnet hat,
   * ist das die einzige Quelle fuer eine Aufloesungswarnung oder einen
   * sinnvollen Export-Ausschnitt.
   *
   * Schlaegt das Lesen fehl (z.B. HEIC), bleibt `naturGroesse` einfach null -
   * der Hinweis dazu erscheint bereits, sobald der Nutzer das Bild oeffnet
   * (siehe `ladenFehlgeschlagen`), hier muss nichts zusaetzlich gemeldet
   * werden.
   *
   * Der Abgleich `b.datenUrl === datenUrl` schuetzt vor einer veralteten
   * Antwort: Wurde das Bild zwischenzeitlich gedreht, hat `datenUrl` sich
   * schon geaendert und `drehe()` bereits eine frische `naturGroesse`
   * gesetzt - die hier noch laufende Messung des alten Standes darf die
   * neue nicht ueberschreiben. Die immutable Aktualisierung darf auch waehrend
   * eines Exports fertig werden: Dessen zuvor kopierter Snapshot bleibt davon
   * unberuehrt, waehrend die ermittelte Groesse fuer spaetere Exporte erhalten
   * bleibt.
   */
  private async measureNaturalSize(id: string, datenUrl: string): Promise<void> {
    try {
      const element = await this.loadImage(datenUrl);
      this.images.update((liste) =>
        liste.map((b) =>
          b.id === id && b.dataUrl === datenUrl
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

    const betroffen = this.images().find((b) => b.id === id);
    if (betroffen) URL.revokeObjectURL(betroffen.dataUrl);

    this.images.update((liste) => liste.filter((b) => b.id !== id));
    if (this.activeImageId() === id) {
      this.activeImageId.set(this.images()[0]?.id ?? null);
    }
  }

  saveCrop(id: string, rechteck: Rect): void {
    if (this.isBusy()) return;

    const plattform = this.workingPlatform();
    if (!plattform) return;

    this.images.update((liste) =>
      liste.map((b) =>
        b.id === id
          ? {
              ...b,
              crops: setCrop(b.crops, plattform.id, rechteck, this.selectedPlatforms()),
            }
          : b,
      ),
    );
  }

  /** Uebertraegt den aktiven Zuschnitt auf alle anderen gewaehlten Plattformen. */
  applyToAll(id: string): void {
    if (this.isBusy()) return;

    const plattform = this.workingPlatform();
    if (!plattform) return;

    this.images.update((liste) =>
      liste.map((b) =>
        b.id === id
          ? {
              ...b,
              crops: applyCropToAll(b.crops, plattform.id, this.selectedPlatforms()),
            }
          : b,
      ),
    );
  }

  /**
   * `(ladenFehlgeschlagen)` vom Editor: Der Cropper konnte dieses Bild nicht
   * anzeigen (typischerweise HEIC). Zeigt den Hinweis sofort direkt am
   * betroffenen Bild, statt den leeren Editor stehen zu lassen und erst beim
   * Export ueberhaupt zu bemerken, dass etwas fehlt.
   */
  onLoadFailed(id: string): void {
    if (this.isBusy()) return;

    this.images.update((liste) =>
      liste.map((b) =>
        b.id === id ? { ...b, loadError: isHeic(b.file) ? HEIC_HINT : READ_HINT } : b,
      ),
    );
  }

  /**
   * `(bildGeladen)` vom Editor: Das Bild liess sich doch anzeigen.
   *
   * Ohne dieses Zuruecksetzen bleibt ein einmal gemeldeter Lesefehler fuer
   * dieses Bild fuer immer stehen - auch nach einer Drehung oder einem
   * erneuten Laden, bei dem alles funktioniert. Im Betrieb stand deshalb eine
   * Fehlermeldung ueber einem Bild, das sichtbar in Ordnung war.
   */
  onImageLoaded(id: string): void {
    this.images.update((liste) =>
      liste.map((b) => (b.id === id && b.loadError ? { ...b, loadError: null } : b)),
    );
  }

  /**
   * Dreht ein Bild um eine weitere Viertelumdrehung im Uhrzeigersinn.
   *
   * Gerendert wird immer aus `datei`, der unveraenderten Originaldatei - nie
   * aus dem zuletzt gedrehten `datenUrl`. Wuerde man von der vorherigen
   * Drehung ausgehen, wuerde jede weitere Drehung erneut als JPEG kodieren
   * und das Bild verlöre bei mehrfachem Drehen sichtbar an Qualitaet.
   */
  async rotate(id: string): Promise<void> {
    if (this.isBusy() || this.destroyed) return;

    return this.rotationQueue.enqueue(id, async () => {
      // Der Drehstand wird absichtlich erst bei Ausfuehrung gelesen. Dadurch
      // baut jede wartende Drehung auf dem Ergebnis ihrer Vorgaengerin auf.
      if (this.isBusy() || this.destroyed) return;
      const bild = this.images().find((eintrag) => eintrag.id === id);
      if (!bild) return;

      const ausgangsUrl = bild.dataUrl;
      const neueDrehung = ((bild.rotation + 1) % 4) as 0 | 1 | 2 | 3;

      try {
        const { datenUrl, groesse } = await this.rotateFile(bild.file, neueDrehung);

        // Eine vor Exportstart begonnene Drehung darf den bereits erstellten
        // Snapshot und den waehrenddessen gesperrten Live-Zustand nicht mehr
        // veraendern. Ihre neu erzeugte URL wird sofort freigegeben.
        if (this.isBusy() || this.destroyed) {
          URL.revokeObjectURL(datenUrl);
          return;
        }

        let ersetzteUrl: string | null = null;
        let uebernommen = false;
        this.images.update((liste) => {
          const ergebnis = replaceIfCurrent(liste, id, ausgangsUrl, (aktuell) => ({
            ...aktuell,
            dataUrl: datenUrl,
            rotation: neueDrehung,
            // Ein vor der Drehung gezogener Ausschnitt bezieht sich auf
            // die ungedrehte Geometrie und wird deshalb verworfen.
            crops: {},
            naturalSize: groesse,
          }));
          ersetzteUrl = ergebnis.replacedUrl;
          uebernommen = ergebnis.applied;
          return ergebnis.list;
        });

        if (uebernommen && ersetzteUrl) {
          URL.revokeObjectURL(ersetzteUrl);
        } else {
          // Das Bild wurde entfernt oder bereits durch einen neueren Stand
          // ersetzt. Das unbenutzte Drehergebnis darf nicht im Speicher bleiben.
          URL.revokeObjectURL(datenUrl);
        }
      } catch (e: unknown) {
        if (!this.isBusy() && !this.destroyed) {
          this.error.set(e instanceof Error ? e.message : 'Das Bild liess sich nicht drehen.');
        }
      }
    });
  }

  /**
   * Rendert `datei` um `viertel` Viertelumdrehungen im Uhrzeigersinn gedreht
   * in eine neue Zeichenflaeche und liefert die Object-URL des Ergebnisses
   * zusammen mit der resultierenden Groesse. Bei einer ungeraden Anzahl
   * Viertelumdrehungen tauschen Breite und Hoehe der Zeichenflaeche
   * gegenueber dem Original.
   */
  private async rotateFile(
    datei: File,
    viertel: 0 | 1 | 2 | 3,
  ): Promise<{ datenUrl: string; groesse: Size }> {
    const quelle = await this.loadOriginalFile(datei);
    const breite = quelle.width;
    const hoehe = quelle.height;
    const seitenGetauscht = viertel % 2 === 1;

    const flaeche = document.createElement('canvas');
    flaeche.width = seitenGetauscht ? hoehe : breite;
    flaeche.height = seitenGetauscht ? breite : hoehe;

    const stift = flaeche.getContext('2d');
    if (!stift) throw new Error('Der Browser stellt keine Zeichenflaeche bereit.');

    // Weisser Grund: wie beim Export bliebe sonst ein durchsichtiger
    // PNG-Bereich als Schwarz stehen, sobald als JPEG kodiert wird.
    stift.fillStyle = '#ffffff';
    stift.fillRect(0, 0, flaeche.width, flaeche.height);
    stift.imageSmoothingQuality = 'high';

    stift.translate(flaeche.width / 2, flaeche.height / 2);
    stift.rotate((viertel * 90 * Math.PI) / 180);
    stift.drawImage(quelle, -breite / 2, -hoehe / 2, breite, hoehe);

    if (quelle instanceof ImageBitmap) quelle.close();

    const blob = await new Promise<Blob>((aufloesen, ablehnen) => {
      flaeche.toBlob(
        (b) =>
          b ? aufloesen(b) : ablehnen(new Error('Das gedrehte Bild liess sich nicht erzeugen.')),
        'image/jpeg',
        0.92,
      );
    });

    return {
      datenUrl: URL.createObjectURL(blob),
      groesse: { width: flaeche.width, height: flaeche.height },
    };
  }

  /**
   * Laedt die Originaldatei als zeichenbare Quelle fuer die Zeichenflaeche.
   * `createImageBitmap` wird bevorzugt (dekodiert ausserhalb des UI-Threads);
   * ohne diese API dient ein `<img>` an einer eigenen, danach wieder
   * freigegebenen Object-URL als Rueckfallebene.
   */
  private async loadOriginalFile(datei: File): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(datei);
    }

    const url = URL.createObjectURL(datei);
    try {
      return await this.loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Schiebt ein Bild in der Reihenfolge. Position 0 ist das Hauptbild. */
  moveImage(id: string, richtung: -1 | 1): void {
    if (this.isBusy()) return;

    this.images.update((liste) => {
      const von = liste.findIndex((b) => b.id === id);
      const nach = von + richtung;
      if (von === -1 || nach < 0 || nach >= liste.length) return liste;

      const neu = [...liste];
      [neu[von], neu[nach]] = [neu[nach], neu[von]];
      return neu;
    });
  }

  async exportImages(): Promise<void> {
    if (this.isBusy() || this.rotationsPending() || this.resolutionIssue()) return;

    this.isBusy.set(true);
    this.error.set(null);
    const snapshot = createExportSnapshot(this.images(), this.selectedPlatforms());

    try {
      const eintraege = [];

      for (const [index, bild] of snapshot.bilder.entries()) {
        const element = await this.loadImage(bild.dataUrl);
        // Letzte Absicherung, falls `naturGroesse` unmittelbar nach dem
        // Hochladen noch nicht ermittelt wurde.
        const ersatz = fullImageRect(bild) ?? {
          x: 0,
          y: 0,
          width: element.naturalWidth,
          height: element.naturalHeight,
        };

        for (const p of snapshot.profile) {
          const ausschnitt = bild.crops[p.id] ?? ersatz;
          const pruefung = checkOutput(ausschnitt, null, p);
          if (pruefung && !pruefung.isValid) {
            throw new Error(
              `${bild.file.name} ist für ${p.name} mit ${pruefung.width} × ${pruefung.height} px zu klein.`,
            );
          }
          eintraege.push({
            folder: folderName(p),
            file: fileName(index, p),
            data: await this.bildExport.create(element, ausschnitt, p),
          });
        }
      }

      const archiv = await this.zipExport.pack(eintraege);
      this.download(archiv, 'flipbase-bilder.zip');
      this.toast.success('Bilder wurden exportiert.');
    } catch (e: unknown) {
      const beschreibung = e instanceof Error ? e.message : 'Der Export ist fehlgeschlagen.';
      this.error.set(beschreibung);
      this.toast.error('Bilder konnten nicht exportiert werden.', beschreibung);
    } finally {
      this.isBusy.set(false);
    }
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((aufloesen, ablehnen) => {
      const bild = new Image();
      bild.onload = () => aufloesen(bild);
      bild.onerror = () => ablehnen(new Error(HEIC_HINT));
      bild.src = url;
    });
  }

  private download(daten: Blob, name: string): void {
    const url = URL.createObjectURL(daten);
    const verweis = document.createElement('a');
    verweis.href = url;
    verweis.download = name;
    verweis.click();
    URL.revokeObjectURL(url);
  }
}
