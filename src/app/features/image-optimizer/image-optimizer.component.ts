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
  Groesse,
  PLATTFORM_PROFILE,
  PlattformProfil,
  ProfilId,
  Rechteck,
} from './models/plattform-profile';
import { ZuschnittEditorComponent } from './components/zuschnitt-editor/zuschnitt-editor.component';
import { PlattformVorschauComponent } from './components/plattform-vorschau/plattform-vorschau.component';
import { BildListeComponent } from './components/bild-liste/bild-liste.component';
import { FotoguideComponent } from './components/fotoguide/fotoguide.component';
import { BildExportService, dateiName } from './services/bild-export.service';
import { ZipExportService, ordnerName } from './services/zip-export.service';
import { setzeZuschnitt, uebernimmAufAlle, Zuschnitte } from './services/zuschnitte';
import { SchluesselWarteschlange } from './services/async-warteschlange';
import { erstelleExportSnapshot, ersetzeWennAktuell } from './services/async-zustand';
import { FotoguideZustand } from './services/fotoguide-zustand';
import { findeAufloesungsproblem, pruefeAusgabe } from './services/plattform-validierung';

/**
 * Hinweistext fuer Bilder, die der Browser nicht als Bild dekodieren kann -
 * typischerweise HEIC-Fotos vom iPhone. An genau dieser einen Stelle
 * definiert und sowohl beim Lesen (ueber das `loadImageFailed`-Ereignis des
 * Editors) als auch beim Export (`ladeBild`) referenziert, damit die beiden
 * Meldungen nie auseinanderlaufen koennen.
 */
export const HEIC_HINWEIS =
  'Das Bild liess sich nicht lesen. HEIC-Dateien vom iPhone kann der Browser oft nicht öffnen.';

/**
 * Hinweistext fuer alle uebrigen Formate, die sich nicht anzeigen liessen.
 *
 * Wichtig, dass es diesen zweiten Text gibt: Ein Fehlschlag bei einer PNG- oder
 * JPEG-Datei mit "HEIC-Dateien vom iPhone" zu erklaeren schickt den Nutzer in
 * die voellig falsche Richtung - genau das ist im Betrieb passiert.
 */
export const LESE_HINWEIS =
  'Das Bild liess sich nicht anzeigen. Versuche es mit einer anderen Datei oder speichere es vorher als JPEG.';

/** Ob eine Datei ein HEIC/HEIF-Foto ist - danach richtet sich der Hinweistext. */
export function istHeic(datei: File): boolean {
  const typ = (datei.type || '').toLowerCase();
  const name = (datei.name || '').toLowerCase();
  return typ.includes('heic') || typ.includes('heif') || /\.(heic|heif)$/.test(name);
}

/** Ein hochgeladenes Bild mit seinen plattformspezifischen Zuschnitten. */
export interface OptimiererBild {
  readonly id: string;
  readonly datei: File;
  readonly datenUrl: string;
  /** Zuschnitt je Plattform, in Originalpixeln. Leer, solange nichts gesetzt wurde. */
  readonly ausschnitte: Zuschnitte;
  /**
   * Viertelumdrehungen im Uhrzeigersinn, bereits in `datenUrl` eingebrannt.
   * `datenUrl` zeigt also immer das fertig gedrehte Bild - Editor, Vorschauen
   * und der Export muessen selbst nichts von einer Drehung wissen.
   */
  readonly drehung: 0 | 1 | 2 | 3;
  /**
   * Hinweis, falls der Cropper dieses Bild beim Lesen nicht anzeigen konnte
   * (siehe `HEIC_HINWEIS`). Null, solange das Lesen nicht fehlgeschlagen ist.
   */
  readonly ladefehler: string | null;
  /**
   * Groesse von `datenUrl` in Originalpixeln, ermittelt kurz nach dem Lesen
   * (bzw. neu nach jeder Drehung, weil sich Breite und Hoehe dabei tauschen
   * koennen). Dient als Ersatz-Ausschnitt (volles Bild) fuer Bilder, die der
   * Nutzer nie im Editor geoeffnet und deshalb nie zugeschnitten hat - ohne
   * das blieben Warnungen und Export fuer diese Bilder blind. Null, solange
   * die Groesse noch nicht bekannt ist (z.B. HEIC oder eine noch laufende
   * Ermittlung).
   */
  readonly naturGroesse: Groesse | null;
}

/**
 * Das volle Bild als Ersatz fuer Plattformen ohne eigenen Zuschnitt. Null
 * nur, solange die natuerliche Groesse noch nicht bekannt ist.
 */
function vollesBild(bild: OptimiererBild): Rechteck | null {
  if (!bild.naturGroesse) return null;
  return { x: 0, y: 0, breite: bild.naturGroesse.breite, hoehe: bild.naturGroesse.hoehe };
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
    ZuschnittEditorComponent,
    PlattformVorschauComponent,
    BildListeComponent,
    FotoguideComponent,
  ],
  templateUrl: './image-optimizer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageOptimizerComponent {
  private readonly bildExport = inject(BildExportService);
  private readonly zipExport = inject(ZipExportService);
  private readonly drehWarteschlange = new SchluesselWarteschlange<string>();
  private zerstoert = false;

  readonly profile = PLATTFORM_PROFILE;

  readonly checkIcon = Check;
  readonly bookIcon = BookOpen;
  readonly helpIcon = CircleHelp;
  readonly xIcon = X;
  readonly fotoguide = new FotoguideZustand();

  readonly bilder = signal<OptimiererBild[]>([]);
  readonly gewaehlteIds = signal<ProfilId[]>(['ebay']);
  readonly aktivesBildId = signal<string | null>(null);

  /** Die Plattform, fuer die der Editor gerade einen Zuschnitt bearbeitet. */
  readonly aktivePlattformId = signal<ProfilId | null>('ebay');

  readonly laeuft = signal(false);
  readonly drehungenLaufen = computed(() => this.drehWarteschlange.anzahlAusstehend() > 0);
  readonly fehler = signal<string | null>(null);

  readonly gewaehlteProfile = computed<PlattformProfil[]>(() =>
    this.profile.filter((p) => this.gewaehlteIds().includes(p.id)),
  );

  readonly aktivesBild = computed<OptimiererBild | null>(
    () => this.bilder().find((b) => b.id === this.aktivesBildId()) ?? null,
  );

  /** Faellt auf die erste gewaehlte Plattform zurueck, falls die aktive entfaellt. */
  readonly aktivePlattform = computed<PlattformProfil | null>(() => {
    const gewaehlt = this.gewaehlteProfile();
    if (gewaehlt.length === 0) return null;

    const aktiv = gewaehlt.find((p) => p.id === this.aktivePlattformId());
    return aktiv ?? gewaehlt[0];
  });

  /** Der Zuschnitt des aktiven Bildes fuer die aktive Plattform. */
  readonly aktiverAusschnitt = computed<Rechteck | null>(() => {
    const bild = this.aktivesBild();
    const plattform = this.aktivePlattform();
    if (!bild || !plattform) return null;
    return bild.ausschnitte[plattform.id] ?? null;
  });

  readonly aktiveAusgabePruefung = computed(() => {
    const bild = this.aktivesBild();
    const plattform = this.aktivePlattform();
    if (!bild || !plattform) return null;
    return pruefeAusgabe(bild.ausschnitte[plattform.id] ?? null, bild.naturGroesse, plattform);
  });

  readonly aufloesungsproblem = computed(() =>
    findeAufloesungsproblem(
      this.bilder().map((bild) => ({
        name: bild.datei.name,
        naturGroesse: bild.naturGroesse,
        ausschnitte: bild.ausschnitte,
      })),
      this.gewaehlteProfile(),
    ),
  );

  constructor() {
    // `entferne()` gibt die Object-URL eines Bildes frei, sobald es aus der
    // Liste geloescht wird - verlaesst der Nutzer die Seite aber vorher,
    // bleiben alle noch geladenen Fotos in vollem Original in Erinnerung.
    inject(DestroyRef).onDestroy(() => {
      this.zerstoert = true;
      for (const bild of this.bilder()) {
        URL.revokeObjectURL(bild.datenUrl);
      }
    });
  }

  schaltePlattform(id: ProfilId): void {
    if (this.laeuft()) return;

    const vorher = this.gewaehlteIds();
    const wirdGewaehlt = !vorher.includes(id);

    // Mindestens ein Exportziel bleibt immer gewaehlt. Im Template ist der
    // entsprechende Kreuz-Knopf zusaetzlich gar nicht erst sichtbar.
    if (!wirdGewaehlt && vorher.length === 1) return;

    this.gewaehlteIds.update((ids) =>
      ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id],
    );

    if (!wirdGewaehlt) {
      if (this.aktivePlattformId() === id) {
        this.aktivePlattformId.set(this.gewaehlteIds()[0] ?? null);
      }
      return;
    }

    // Neu dazugewaehlt: aus dem bisherigen Arbeitsziel ableiten, damit fuer
    // bereits bearbeitete Bilder nicht unbemerkt das Vollbild exportiert wird.
    const quelle = this.aktivePlattform();
    if (!quelle) return;

    const gewaehlt = this.gewaehlteProfile();
    this.bilder.update((liste) =>
      liste.map((b) => {
        const rechteck = b.ausschnitte[quelle.id];
        if (!rechteck) return b;
        return {
          ...b,
          ausschnitte: setzeZuschnitt(b.ausschnitte, quelle.id, rechteck, gewaehlt),
        };
      }),
    );
  }

  /** Waehlt eine Plattform bei Bedarf aus und setzt sie immer als Arbeitsziel. */
  waehleArbeitsziel(id: ProfilId): void {
    if (this.laeuft()) return;

    if (!this.gewaehlteIds().includes(id)) {
      this.schaltePlattform(id);
    }
    this.aktivePlattformId.set(id);
  }

  setzeAktivesBild(id: string): void {
    if (this.laeuft()) return;
    this.aktivesBildId.set(id);
  }

  async nimmDateien(dateien: FileList | null): Promise<void> {
    if (this.laeuft() || !dateien) return;

    const neue: OptimiererBild[] = [];
    for (const datei of Array.from(dateien)) {
      if (!datei.type.startsWith('image/')) continue;
      neue.push({
        id: crypto.randomUUID(),
        datei,
        datenUrl: URL.createObjectURL(datei),
        ausschnitte: {},
        drehung: 0,
        ladefehler: null,
        naturGroesse: null,
      });
    }

    this.bilder.update((liste) => [...liste, ...neue]);
    if (!this.aktivesBildId() && neue.length > 0) {
      this.aktivesBildId.set(neue[0].id);
    }

    for (const bild of neue) {
      void this.ermittleNaturGroesse(bild.id, bild.datenUrl);
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
  private async ermittleNaturGroesse(id: string, datenUrl: string): Promise<void> {
    try {
      const element = await this.ladeBild(datenUrl);
      this.bilder.update((liste) =>
        liste.map((b) =>
          b.id === id && b.datenUrl === datenUrl
            ? { ...b, naturGroesse: { breite: element.naturalWidth, hoehe: element.naturalHeight } }
            : b,
        ),
      );
    } catch {
      // Siehe Kommentar oben - bewusst kein Fehlerpfad hier.
    }
  }

  entferne(id: string): void {
    if (this.laeuft()) return;

    const betroffen = this.bilder().find((b) => b.id === id);
    if (betroffen) URL.revokeObjectURL(betroffen.datenUrl);

    this.bilder.update((liste) => liste.filter((b) => b.id !== id));
    if (this.aktivesBildId() === id) {
      this.aktivesBildId.set(this.bilder()[0]?.id ?? null);
    }
  }

  merkeAusschnitt(id: string, rechteck: Rechteck): void {
    if (this.laeuft()) return;

    const plattform = this.aktivePlattform();
    if (!plattform) return;

    this.bilder.update((liste) =>
      liste.map((b) =>
        b.id === id
          ? {
              ...b,
              ausschnitte: setzeZuschnitt(
                b.ausschnitte,
                plattform.id,
                rechteck,
                this.gewaehlteProfile(),
              ),
            }
          : b,
      ),
    );
  }

  /** Uebertraegt den aktiven Zuschnitt auf alle anderen gewaehlten Plattformen. */
  uebernehmen(id: string): void {
    if (this.laeuft()) return;

    const plattform = this.aktivePlattform();
    if (!plattform) return;

    this.bilder.update((liste) =>
      liste.map((b) =>
        b.id === id
          ? {
              ...b,
              ausschnitte: uebernimmAufAlle(b.ausschnitte, plattform.id, this.gewaehlteProfile()),
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
  beiLadeFehler(id: string): void {
    if (this.laeuft()) return;

    this.bilder.update((liste) =>
      liste.map((b) =>
        b.id === id ? { ...b, ladefehler: istHeic(b.datei) ? HEIC_HINWEIS : LESE_HINWEIS } : b,
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
  beiBildGeladen(id: string): void {
    this.bilder.update((liste) =>
      liste.map((b) => (b.id === id && b.ladefehler ? { ...b, ladefehler: null } : b)),
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
  async drehe(id: string): Promise<void> {
    if (this.laeuft() || this.zerstoert) return;

    return this.drehWarteschlange.einreihen(id, async () => {
      // Der Drehstand wird absichtlich erst bei Ausfuehrung gelesen. Dadurch
      // baut jede wartende Drehung auf dem Ergebnis ihrer Vorgaengerin auf.
      if (this.laeuft() || this.zerstoert) return;
      const bild = this.bilder().find((eintrag) => eintrag.id === id);
      if (!bild) return;

      const ausgangsUrl = bild.datenUrl;
      const neueDrehung = ((bild.drehung + 1) % 4) as 0 | 1 | 2 | 3;

      try {
        const { datenUrl, groesse } = await this.dreheDatei(bild.datei, neueDrehung);

        // Eine vor Exportstart begonnene Drehung darf den bereits erstellten
        // Snapshot und den waehrenddessen gesperrten Live-Zustand nicht mehr
        // veraendern. Ihre neu erzeugte URL wird sofort freigegeben.
        if (this.laeuft() || this.zerstoert) {
          URL.revokeObjectURL(datenUrl);
          return;
        }

        let ersetzteUrl: string | null = null;
        let uebernommen = false;
        this.bilder.update((liste) => {
          const ergebnis = ersetzeWennAktuell(liste, id, ausgangsUrl, (aktuell) => ({
            ...aktuell,
            datenUrl,
            drehung: neueDrehung,
            // Ein vor der Drehung gezogener Ausschnitt bezieht sich auf
            // die ungedrehte Geometrie und wird deshalb verworfen.
            ausschnitte: {},
            naturGroesse: groesse,
          }));
          ersetzteUrl = ergebnis.ersetzteUrl;
          uebernommen = ergebnis.uebernommen;
          return ergebnis.liste;
        });

        if (uebernommen && ersetzteUrl) {
          URL.revokeObjectURL(ersetzteUrl);
        } else {
          // Das Bild wurde entfernt oder bereits durch einen neueren Stand
          // ersetzt. Das unbenutzte Drehergebnis darf nicht im Speicher bleiben.
          URL.revokeObjectURL(datenUrl);
        }
      } catch (e: unknown) {
        if (!this.laeuft() && !this.zerstoert) {
          this.fehler.set(e instanceof Error ? e.message : 'Das Bild liess sich nicht drehen.');
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
  private async dreheDatei(
    datei: File,
    viertel: 0 | 1 | 2 | 3,
  ): Promise<{ datenUrl: string; groesse: Groesse }> {
    const quelle = await this.ladeOriginaldatei(datei);
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
      groesse: { breite: flaeche.width, hoehe: flaeche.height },
    };
  }

  /**
   * Laedt die Originaldatei als zeichenbare Quelle fuer die Zeichenflaeche.
   * `createImageBitmap` wird bevorzugt (dekodiert ausserhalb des UI-Threads);
   * ohne diese API dient ein `<img>` an einer eigenen, danach wieder
   * freigegebenen Object-URL als Rueckfallebene.
   */
  private async ladeOriginaldatei(datei: File): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(datei);
    }

    const url = URL.createObjectURL(datei);
    try {
      return await this.ladeBild(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Schiebt ein Bild in der Reihenfolge. Position 0 ist das Hauptbild. */
  verschiebe(id: string, richtung: -1 | 1): void {
    if (this.laeuft()) return;

    this.bilder.update((liste) => {
      const von = liste.findIndex((b) => b.id === id);
      const nach = von + richtung;
      if (von === -1 || nach < 0 || nach >= liste.length) return liste;

      const neu = [...liste];
      [neu[von], neu[nach]] = [neu[nach], neu[von]];
      return neu;
    });
  }

  async exportiere(): Promise<void> {
    if (this.laeuft() || this.drehungenLaufen() || this.aufloesungsproblem()) return;

    this.laeuft.set(true);
    this.fehler.set(null);
    const snapshot = erstelleExportSnapshot(this.bilder(), this.gewaehlteProfile());

    try {
      const eintraege = [];

      for (const [index, bild] of snapshot.bilder.entries()) {
        const element = await this.ladeBild(bild.datenUrl);
        // Letzte Absicherung, falls `naturGroesse` unmittelbar nach dem
        // Hochladen noch nicht ermittelt wurde.
        const ersatz = vollesBild(bild) ?? {
          x: 0,
          y: 0,
          breite: element.naturalWidth,
          hoehe: element.naturalHeight,
        };

        for (const p of snapshot.profile) {
          const ausschnitt = bild.ausschnitte[p.id] ?? ersatz;
          const pruefung = pruefeAusgabe(ausschnitt, null, p);
          if (pruefung && !pruefung.istGueltig) {
            throw new Error(
              `${bild.datei.name} ist für ${p.name} mit ${pruefung.breite} × ${pruefung.hoehe} px zu klein.`,
            );
          }
          eintraege.push({
            ordner: ordnerName(p),
            datei: dateiName(index, p),
            daten: await this.bildExport.erzeuge(element, ausschnitt, p),
          });
        }
      }

      const archiv = await this.zipExport.packe(eintraege);
      this.ladeHerunter(archiv, 'flipbase-bilder.zip');
    } catch (e: unknown) {
      this.fehler.set(e instanceof Error ? e.message : 'Der Export ist fehlgeschlagen.');
    } finally {
      this.laeuft.set(false);
    }
  }

  private ladeBild(url: string): Promise<HTMLImageElement> {
    return new Promise((aufloesen, ablehnen) => {
      const bild = new Image();
      bild.onload = () => aufloesen(bild);
      bild.onerror = () => ablehnen(new Error(HEIC_HINWEIS));
      bild.src = url;
    });
  }

  private ladeHerunter(daten: Blob, name: string): void {
    const url = URL.createObjectURL(daten);
    const verweis = document.createElement('a');
    verweis.href = url;
    verweis.download = name;
    verweis.click();
    URL.revokeObjectURL(url);
  }
}
