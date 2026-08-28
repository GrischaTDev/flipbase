import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Adjustments } from '../../models/image-adjustments';
import { adjustmentRange, isDefault } from '../../services/adjustments';

interface Slider {
  readonly key: keyof Adjustments;
  readonly label: string;
  readonly step: number;
}

/** Farbe und Belichtung des aktiven Bildes. */
@Component({
  selector: 'app-adjustment-controls',
  imports: [],
  templateUrl: './adjustment-controls.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdjustmentControlsComponent {
  readonly adjustments = input.required<Adjustments>();
  readonly disabled = input(false);
  readonly canApplyToAll = input(false);

  readonly changed = output<Adjustments>();
  readonly resetRequested = output<void>();
  readonly applyToAllRequested = output<void>();

  /** Beschriftungen bleiben deutsch - sie stehen sichtbar in der Oberflaeche. */
  readonly sliders: readonly Slider[] = [
    { key: 'brightness', label: 'Helligkeit', step: 0.01 },
    { key: 'contrast', label: 'Kontrast', step: 0.01 },
    { key: 'saturation', label: 'Sättigung', step: 0.01 },
    { key: 'grayscale', label: 'Graustufen', step: 0.01 },
  ];

  range(key: keyof Adjustments): { min: number; max: number } {
    return adjustmentRange(key);
  }

  valueOf(key: keyof Adjustments): number {
    return this.adjustments()[key];
  }

  /** Als Prozent, weil "1.2" niemandem etwas sagt und "120 %" schon. */
  percentOf(key: keyof Adjustments): number {
    return Math.round(this.adjustments()[key] * 100);
  }

  isUntouched(): boolean {
    return isDefault(this.adjustments());
  }

  onSlider(key: keyof Adjustments, raw: string): void {
    this.changed.emit({ ...this.adjustments(), [key]: Number(raw) });
  }
}
