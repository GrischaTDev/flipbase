import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { LucideDynamicIcon, LucideCheck as Check } from '@lucide/angular';
import { PLATTFORM_PROFILE, PlattformProfil, ProfilId, Rechteck } from './models/plattform-profile';
import { ZuschnittEditorComponent } from './components/zuschnitt-editor/zuschnitt-editor.component';
import { PlattformVorschauComponent } from './components/plattform-vorschau/plattform-vorschau.component';
import { BildListeComponent } from './components/bild-liste/bild-liste.component';
import { BildExportService, dateiName } from './services/bild-export.service';
import { ZipExportService, ordnerName } from './services/zip-export.service';
import { reichtAufloesung, vergroesserungsfaktor } from './services/zuschnitt';

/** Ein hochgeladenes Bild mit seinem Zuschnitt. */
export interface OptimiererBild {
  readonly id: string;
  readonly datei: File;
  readonly datenUrl: string;
  /** Ausschnitt in Originalpixeln. Null, solange nichts gesetzt wurde. */
  readonly ausschnitt: Rechteck | null;
  /**
   * Viertelumdrehungen im Uhrzeigersinn, bereits in `datenUrl` eingebrannt.
   * `datenUrl` zeigt also immer das fertig gedrehte Bild - Editor, Vorschauen
   * und der Export muessen selbst nichts von einer Drehung wissen.
   */
  readonly drehung: 0 | 1 | 2 | 3;
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
  ],
  templateUrl: './image-optimizer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageOptimizerComponent {
  private readonly bildExport = inject(BildExportService);
  private readonly zipExport = inject(ZipExportService);

  readonly profile = PLATTFORM_PROFILE;

  readonly checkIcon = Check;

  readonly bilder = signal<OptimiererBild[]>([]);
  readonly gewaehlteIds = signal<ProfilId[]>(['ebay']);
  readonly aktivesBildId = signal<string | null>(null);

  readonly laeuft = signal(false);
  readonly fehler = signal<string | null>(null);

  readonly gewaehlteProfile = computed<PlattformProfil[]>(() =>
    this.profile.filter((p) => this.gewaehlteIds().includes(p.id)),
  );

  readonly aktivesBild = computed<OptimiererBild | null>(
    () => this.bilder().find((b) => b.id === this.aktivesBildId()) ?? null,
  );

  /** Ob mindestens eine gewaehlte Plattform tatsaechlich beschneidet. */
  readonly esWirdGeschnitten = computed<boolean>(() =>
    this.gewaehlteProfile().some((p) => p.schneidet),
  );

  /** Bilder, deren Ausschnitt fuer mindestens eine Plattform zu klein ist. */
  readonly warnungen = computed<string[]>(() => {
    const meldungen: string[] = [];

    for (const [index, bild] of this.bilder().entries()) {
      if (!bild.ausschnitt) continue;

      for (const p of this.gewaehlteProfile()) {
        if (!reichtAufloesung(bild.ausschnitt, p.exportBreite, p.exportHoehe)) {
          const faktor = vergroesserungsfaktor(bild.ausschnitt, p.exportBreite);
          meldungen.push(
            `Bild ${index + 1} für ${p.name}: Der Ausschnitt wird ${faktor.toFixed(1)}-fach ` +
              `vergrößert und kann unscharf werden.`,
          );
        }
      }
    }

    return meldungen;
  });

  constructor() {
    // `entferne()` gibt die Object-URL eines Bildes frei, sobald es aus der
    // Liste geloescht wird - verlaesst der Nutzer die Seite aber vorher,
    // bleiben alle noch geladenen Fotos in vollem Original in Erinnerung.
    inject(DestroyRef).onDestroy(() => {
      for (const bild of this.bilder()) {
        URL.revokeObjectURL(bild.datenUrl);
      }
    });
  }

  schaltePlattform(id: ProfilId): void {
    this.gewaehlteIds.update((ids) =>
      ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id],
    );
  }

  async nimmDateien(dateien: FileList | null): Promise<void> {
    if (!dateien) return;

    const neue: OptimiererBild[] = [];
    for (const datei of Array.from(dateien)) {
      if (!datei.type.startsWith('image/')) continue;
      neue.push({
        id: crypto.randomUUID(),
        datei,
        datenUrl: URL.createObjectURL(datei),
        ausschnitt: null,
        drehung: 0,
      });
    }

    this.bilder.update((liste) => [...liste, ...neue]);
    if (!this.aktivesBildId() && neue.length > 0) {
      this.aktivesBildId.set(neue[0].id);
    }
  }

  entferne(id: string): void {
    const betroffen = this.bilder().find((b) => b.id === id);
    if (betroffen) URL.revokeObjectURL(betroffen.datenUrl);

    this.bilder.update((liste) => liste.filter((b) => b.id !== id));
    if (this.aktivesBildId() === id) {
      this.aktivesBildId.set(this.bilder()[0]?.id ?? null);
    }
  }

  merkeAusschnitt(id: string, ausschnitt: Rechteck): void {
    this.bilder.update((liste) => liste.map((b) => (b.id === id ? { ...b, ausschnitt } : b)));
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
    const bild = this.bilder().find((b) => b.id === id);
    if (!bild) return;

    const neueDrehung = ((bild.drehung + 1) % 4) as 0 | 1 | 2 | 3;

    try {
      const datenUrl = await this.dreheDatei(bild.datei, neueDrehung);
      URL.revokeObjectURL(bild.datenUrl);

      this.bilder.update((liste) =>
        liste.map((b) =>
          b.id === id
            ? {
                ...b,
                datenUrl,
                drehung: neueDrehung,
                // Ein vor der Drehung gezogener Ausschnitt bezieht sich auf
                // die ungedrehte Geometrie und zeigt danach auf einen ganz
                // anderen Bildbereich - er wird deshalb bewusst verworfen
                // statt umgerechnet oder uebernommen.
                ausschnitt: null,
              }
            : b,
        ),
      );
    } catch (e: unknown) {
      this.fehler.set(e instanceof Error ? e.message : 'Das Bild liess sich nicht drehen.');
    }
  }

  /**
   * Rendert `datei` um `viertel` Viertelumdrehungen im Uhrzeigersinn gedreht
   * in eine neue Zeichenflaeche und liefert die Object-URL des Ergebnisses.
   * Bei einer ungeraden Anzahl Viertelumdrehungen tauschen Breite und Hoehe
   * der Zeichenflaeche gegenueber dem Original.
   */
  private async dreheDatei(datei: File, viertel: 0 | 1 | 2 | 3): Promise<string> {
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

    return URL.createObjectURL(blob);
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
    this.laeuft.set(true);
    this.fehler.set(null);

    try {
      const eintraege = [];

      for (const [index, bild] of this.bilder().entries()) {
        const element = await this.ladeBild(bild.datenUrl);
        const ausschnitt = bild.ausschnitt ?? {
          x: 0,
          y: 0,
          breite: element.naturalWidth,
          hoehe: element.naturalHeight,
        };

        for (const p of this.gewaehlteProfile()) {
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
      bild.onerror = () =>
        ablehnen(
          new Error(
            'Das Bild liess sich nicht lesen. HEIC-Dateien vom iPhone kann der Browser oft nicht öffnen.',
          ),
        );
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
