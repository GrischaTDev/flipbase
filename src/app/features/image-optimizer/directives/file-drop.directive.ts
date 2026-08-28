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
 */
@Directive({
  selector: '[appFileDrop]',
  host: {
    '(dragenter)': 'onDragEnter($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
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

  onDragEnter(event: DragEvent): void {
    if (this.disabled() || !this.carriesFiles(event)) return;
    event.preventDefault();
    this.depth++;
    if (this.depth === 1) this.dragActiveChanged.emit(true);
  }

  /**
   * Ohne `preventDefault` gilt das Ablegen als nicht erlaubt und der Browser
   * oeffnet die Datei stattdessen in einem neuen Tab - die Arbeit waere weg.
   */
  onDragOver(event: DragEvent): void {
    if (this.disabled() || !this.carriesFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onDragLeave(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) this.dragActiveChanged.emit(false);
  }

  onDrop(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    this.depth = 0;
    this.dragActiveChanged.emit(false);

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) this.filesDropped.emit(files);
  }

  onPaste(event: ClipboardEvent): void {
    if (this.disabled()) return;

    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length > 0) this.filesDropped.emit(files);
  }

  /** Ignoriert das Ziehen von Text oder Verweisen innerhalb der Seite. */
  private carriesFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files');
  }
}
