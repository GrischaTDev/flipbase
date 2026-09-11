import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideDynamicIcon, LucideImagePlus as ImagePlus } from '@lucide/angular';

/**
 * Zwei Zustaende in einer Komponente: die dauerhafte Flaeche, solange noch
 * kein Bild geladen ist, und die Ueberlagerung waehrend eines Ziehvorgangs.
 */
@Component({
  selector: 'app-drop-zone',
  imports: [LucideDynamicIcon],
  templateUrl: './drop-zone.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DropZoneComponent {
  readonly isDragActive = input(false);
  readonly hasImages = input(false);
  readonly disabled = input(false);

  readonly filesPicked = output<readonly File[]>();

  readonly uploadIcon = ImagePlus;

  /**
   * Hintergrund, Rand und Ring je Zustand als ganze Klassenkette. Bewusst ohne
   * `linear-surface`: dessen Hintergrund steht in normalem CSS und schlug
   * jeden Tailwind-Hintergrund - der Ablagezustand war dadurch unsichtbar.
   */
  readonly zoneClasses = computed(() =>
    this.isDragActive()
      ? 'border-fb-text-primary bg-fb-primary-subtle shadow-2xl motion-safe:scale-[1.01]'
      : 'border-fb-border bg-fb-surface shadow-xl hover:border-fb-text-muted',
  );

  readonly iconClasses = computed(() =>
    this.isDragActive() ? 'text-fb-text-primary' : 'text-fb-text-muted',
  );

  onFileInput(target: EventTarget | null): void {
    const input = target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (files.length > 0) this.filesPicked.emit(files);
    if (input) input.value = '';
  }
}
