import { Directive, input, output } from '@angular/core';

export interface FileSplit {
  readonly images: readonly File[];
  readonly skipped: number;
}

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
    '(document:dragstart)': 'onDragStart()',
    '(document:dragend)': 'onDragEnd()',
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
   * Ein Ziehen, das in der Seite selbst begonnen hat - etwa ein Vorschaubild.
   * Chrome bietet ein gezogenes `<img>` als Datei an, `dataTransfer.types`
   * enthaelt dann `Files`. Ohne diese Marke hielte `carriesFiles()` es fuer
   * einen echten Datei-Drop und das Bild kaeme ein zweites Mal hinzu.
   */
  private internalDrag = false;

  onDragStart(): void {
    this.internalDrag = true;
  }

  onDragEnd(): void {
    this.internalDrag = false;
  }

  /** Siehe `onDragOver`: Die Abwehr steht auch hier vor jeder Bedingung. */
  onDragEnter(event: DragEvent): void {
    if (!this.carriesFiles(event)) return;
    event.preventDefault();
    if (this.disabled()) return;
    this.depth++;
    if (this.depth === 1) this.dragActiveChanged.emit(true);
  }

  /**
   * Ohne `preventDefault` gilt das Ablegen als nicht erlaubt und der Browser
   * oeffnet die abgelegte Datei stattdessen selbst - die Seite wird verlassen
   * und die Arbeit ist weg.
   *
   * Deshalb geschieht die Abwehr **immer**, sobald Dateien im Spiel sind, und
   * ausdruecklich auch waehrend eines laufenden Exports. `disabled()`
   * unterdrueckt nur die *Wirkung* - Ueberlagerung und Weitergabe der Dateien -,
   * niemals die Abwehr selbst. Stuende `disabled()` davor, wuerde genau der
   * Fall eintreten, den dieser Kommentar beschreibt: Wer waehrend des Exports
   * ein Bild fallen laesst, verliert den laufenden Export.
   */
  onDragOver(event: DragEvent): void {
    if (!this.carriesFiles(event)) return;
    event.preventDefault();
    if (this.disabled()) return;
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
    // `dragend` feuert nach einem Ablegen nicht in jedem Browser verlaesslich;
    // die Marke wird deshalb auch hier zurueckgesetzt.
    const internal = this.internalDrag;
    this.internalDrag = false;
    if (this.disabled() || internal) return;

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) this.filesDropped.emit(files);
  }

  onPaste(event: ClipboardEvent): void {
    if (this.disabled()) return;

    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length > 0) this.filesDropped.emit(files);
  }

  /** Ignoriert Text, Verweise und alles, was in der Seite selbst gezogen wird. */
  private carriesFiles(event: DragEvent): boolean {
    if (this.internalDrag) return false;
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }
}
