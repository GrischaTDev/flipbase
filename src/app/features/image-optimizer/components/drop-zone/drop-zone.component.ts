import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Zwei Zustaende in einer Komponente: die dauerhafte Flaeche, solange noch
 * kein Bild geladen ist, und die Ueberlagerung waehrend eines Ziehvorgangs.
 */
@Component({
  selector: 'app-drop-zone',
  imports: [],
  templateUrl: './drop-zone.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DropZoneComponent {
  readonly isDragActive = input(false);
  readonly hasImages = input(false);
  readonly disabled = input(false);

  readonly filesPicked = output<readonly File[]>();

  onFileInput(target: EventTarget | null): void {
    const input = target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (files.length > 0) this.filesPicked.emit(files);
    if (input) input.value = '';
  }
}
