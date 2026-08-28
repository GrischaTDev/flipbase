import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Titel, Grundname fuer die Exportdateien und der Knopf zum Hinzufuegen. */
@Component({
  selector: 'app-optimizer-header',
  imports: [],
  templateUrl: './optimizer-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptimizerHeaderComponent {
  readonly baseName = input('');
  readonly disabled = input(false);

  readonly baseNameChanged = output<string>();
  readonly filesPicked = output<readonly File[]>();

  onFileInput(target: EventTarget | null): void {
    const input = target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (files.length > 0) this.filesPicked.emit(files);
    if (input) input.value = '';
  }
}
