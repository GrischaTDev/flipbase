import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { hasAnyMetadata, ImageMetadata } from '../../models/image-metadata';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';

/** Zeigt, was in der Originaldatei steckt - und dass es beim Export verschwindet. */
@Component({
  selector: 'app-metadata-modal',
  imports: [ModalShellComponent],
  templateUrl: './metadata-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetadataModalComponent {
  readonly metadata = input.required<ImageMetadata>();

  readonly closed = output<void>();

  readonly isEmpty = computed(() => !hasAnyMetadata(this.metadata()));

  /** Irgendein KI-Signal - Nachweis oder erklaerte Herkunft. */
  readonly hasAiSignal = computed(() => {
    const ai = this.metadata().ai;
    return ai.contentCredential === 'present' || ai.declaredSource !== null;
  });

  readonly hasContentCredential = computed(
    () => this.metadata().ai.contentCredential === 'present',
  );

  /**
   * Ob ueberhaupt nach einem Herkunftsnachweis gesucht wurde. Bei HEIC/AVIF
   * und TIFF wird das nicht getan - der Satz "kein Nachweis gefunden" waere
   * dort eine Behauptung ueber etwas, wonach niemand gesehen hat.
   */
  readonly credentialChecked = computed(() => this.metadata().ai.contentCredential !== 'unchecked');

  readonly fields = computed(() => this.metadata().fields);

  /** "1 Eintrag" statt "1 Einträge" - der Zaehler steht sichtbar ueber der Liste. */
  readonly fieldCountLabel = computed(() => {
    const count = this.fields().length;
    return count === 1 ? '1 Eintrag' : `${count} Einträge`;
  });

  readonly coordinates = computed(() => {
    const gps = this.metadata().gps;
    if (!gps) return null;
    return `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`;
  });
}
