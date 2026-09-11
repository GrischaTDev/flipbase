import { Directive, input, output } from '@angular/core';

export interface FileSplit {
  readonly images: readonly File[];
  readonly skipped: number;
}

/**
 * Eigener MIME-Typ, der einem Ziehvorgang beim Start mitgegeben wird, um ihn
 * als "in der Seite entstanden" zu kennzeichnen. Siehe `onDragStart` fuer die
 * Begruendung, warum das die Marke am Vorgang selbst ist statt an der
 * Direktive.
 */
const INTERNAL_DRAG_TYPE = 'application/x-flipbase-internal';

/**
 * Trennt Bilder von allem anderen.
 *
 * HEIC-Dateien meldet der Browser haeufig ohne `type`. Sie werden trotzdem
 * durchgelassen: Der Nutzer bekommt dann den erklaerenden Hinweis am Bild
 * ("HEIC-Dateien vom iPhone kann der Browser oft nicht oeffnen") statt einer
 * Datei, die kommentarlos verschwindet.
 */
export function splitImageFiles(files: readonly File[]): FileSplit {
  const images = files.filter(
    (file) => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name),
  );
  return { images, skipped: files.length - images.length };
}

/**
 * Nimmt Bilder per Drag-and-Drop und aus der Zwischenablage entgegen.
 *
 * Liegt auf der gesamten Arbeitsflaeche, damit auch bei bereits geladenen
 * Bildern abgelegt werden kann - genau der Fall, der im Alltag zaehlt.
 *
 * Die Ereignisse haengen bewusst am `document`, nicht am eigenen Host-Element:
 * Dieses sitzt in einem zentrierten `max-w-7xl`-Bereich und deckt bei
 * breiten Bildschirmen nur einen Teil der Seite ab. Ein Ablegen ueber der
 * Kopfzeile, der Seitenleiste oder den Raendern daneben wuerde `onDragOver`
 * nie erreichen - `preventDefault()` bliebe aus, der Browser oeffnete die
 * Datei stattdessen selbst und die gesamte Seite mit allen geladenen
 * Bildern, Zuschnitten und der Plattformauswahl waere weg. Die Direktive
 * existiert ohnehin nur, waehrend die Route des Bildoptimierers gemountet
 * ist, `carriesFiles()` filtert weiterhin auf echte Datei-Drags.
 */
@Directive({
  selector: '[appFileDrop]',
  host: {
    '(document:dragstart)': 'onDragStart($event)',
    '(document:dragenter)': 'onDragEnter($event)',
    '(document:dragover)': 'onDragOver($event)',
    '(document:dragleave)': 'onDragLeave($event)',
    '(document:drop)': 'onDrop($event)',
    '(document:paste)': 'onPaste($event)',
  },
})
export class FileDropDirective {
  readonly disabled = input(false);

  readonly filesDropped = output<readonly File[]>();
  readonly dragActiveChanged = output<boolean>();

  /**
   * Tiefenzaehler. `dragleave` feuert auch beim Uebergang auf ein Kindelement -
   * ohne Zaehler flackert die Ablageflaeche beim Ueberfahren der Oberflaeche.
   */
  private depth = 0;

  /**
   * Markiert einen Ziehvorgang, der in der Seite selbst begonnen hat - etwa
   * ein Vorschaubild. Chrome bietet ein gezogenes `<img>` als Datei an,
   * `dataTransfer.types` enthaelt dann `Files` wie bei einem echten Datei-Drag.
   *
   * Die Marke haengt bewusst am `dataTransfer` des Vorgangs selbst, nicht an
   * einem Feld dieser Direktive: Ein Feld muesste durch ein Gegenereignis
   * (`dragend`) wieder zurueckgesetzt werden, und genau dieses Gegenereignis
   * kann ausbleiben - etwa wenn Angular den gezogenen Knoten waehrend des
   * Ziehens aus dem DOM entfernt (`dragend` feuert am Quellknoten, nicht an
   * `document`, und bleibt dann aus) oder das Ziehen ausserhalb des Dokuments
   * endet. Ein haengengebliebenes `true` wuerde jeden folgenden echten
   * Datei-Drop als intern behandeln, `preventDefault()` bliebe aus, und der
   * Browser wuerde die naechste vom Schreibtisch gezogene Datei selbst
   * oeffnen - die gesamte Sitzung waere weg. Am `dataTransfer` gibt es dagegen
   * nichts zurueckzusetzen: Jeder Ziehvorgang bekommt seinen eigenen, frischen
   * `dataTransfer`, die Marke existiert nur so lange wie der Vorgang selbst.
   */
  onDragStart(event: DragEvent): void {
    event.dataTransfer?.setData(INTERNAL_DRAG_TYPE, '1');
  }

  /** Siehe `onDragOver`: Die Abwehr steht auch hier vor jeder Bedingung. */
  onDragEnter(event: DragEvent): void {
    if (!this.carriesFiles(event)) return;
    event.preventDefault();
    if (this.disabled() || this.isInternal(event)) return;
    this.depth++;
    if (this.depth === 1) this.dragActiveChanged.emit(true);
  }

  /**
   * Ohne `preventDefault` gilt das Ablegen als nicht erlaubt und der Browser
   * oeffnet die abgelegte Datei stattdessen selbst - die Seite wird verlassen
   * und die Arbeit ist weg.
   *
   * Deshalb geschieht die Abwehr **immer**, sobald Dateien im Spiel sind - bei
   * einem echten Datei-Drag genauso wie bei einem in der Seite gezogenen
   * Vorschaubild, denn auch das meldet `Files` in `dataTransfer.types` und
   * wuerde ohne `preventDefault` in Firefox eine Navigation zum Bild ausloesen.
   * Ausdruecklich auch waehrend eines laufenden Exports: `disabled()`
   * unterdrueckt nur die *Wirkung* - Ueberlagerung und Weitergabe der Dateien -,
   * niemals die Abwehr selbst. Stuende `disabled()` davor, wuerde genau der
   * Fall eintreten, den dieser Kommentar beschreibt: Wer waehrend des Exports
   * ein Bild fallen laesst, verliert den laufenden Export.
   */
  onDragOver(event: DragEvent): void {
    if (!this.carriesFiles(event)) return;
    event.preventDefault();
    if (this.disabled() || this.isInternal(event)) return;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  /** Siehe `onDragOver`: Die Abwehr steht auch hier vor jeder Bedingung. */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    if (this.disabled()) return;
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) this.dragActiveChanged.emit(false);
  }

  /** Siehe `onDragOver`: Die Abwehr steht auch hier vor jeder Bedingung. */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.depth = 0;
    this.dragActiveChanged.emit(false);
    if (this.disabled() || this.isInternal(event)) return;

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) this.filesDropped.emit(files);
  }

  onPaste(event: ClipboardEvent): void {
    if (this.disabled()) return;

    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length > 0) this.filesDropped.emit(files);
  }

  /**
   * Entscheidet allein darueber, ob die Browser-Standardaktion abgewehrt
   * wird - unabhaengig davon, ob der Ziehvorgang in der Seite entstanden ist.
   */
  private carriesFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }

  /** Ignoriert Vorschaubilder, die in der Seite selbst gezogen werden. */
  private isInternal(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes(INTERNAL_DRAG_TYPE);
  }
}
