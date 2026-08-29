import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Adjustments } from '../../models/image-adjustments';
import { adjustmentRange, isDefault } from '../../services/adjustments';

interface Slider {
  readonly key: keyof Adjustments;
  readonly label: string;
  readonly step: number;
  /**
   * `factor`: 1 ist neutral, angezeigt als 100 %.
   * `share`: 0 ist neutral, angezeigt als 0 bis 100 %.
   * `signed`: 0 ist die Mitte, angezeigt mit Vorzeichen von -100 bis +100 %.
   */
  readonly scale: 'factor' | 'share' | 'signed';
  /** Kurze Erklaerung unter dem Regler - beide neuen sind nicht selbsterklaerend. */
  readonly hint?: string;
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
    { key: 'brightness', label: 'Helligkeit', step: 0.01, scale: 'factor' },
    { key: 'contrast', label: 'Kontrast', step: 0.01, scale: 'factor' },
    { key: 'saturation', label: 'Sättigung', step: 0.01, scale: 'factor' },
    { key: 'grayscale', label: 'Graustufen', step: 0.01, scale: 'share' },
    {
      key: 'warmth',
      label: 'Wärme',
      step: 0.01,
      scale: 'signed',
      hint: 'Nach rechts gegen den Blaustich im Schatten, nach links gegen gelbes Lampenlicht.',
    },
    {
      key: 'sharpness',
      label: 'Schärfe',
      step: 0.01,
      scale: 'share',
      hint: 'Betont Kanten und Stoffstruktur. Zu viel erzeugt helle Säume an Kanten.',
    },
  ];

  range(key: keyof Adjustments): { min: number; max: number } {
    return adjustmentRange(key);
  }

  valueOf(key: keyof Adjustments): number {
    return this.adjustments()[key];
  }

  /**
   * Als Prozent, weil "1.2" niemandem etwas sagt und "120 %" schon.
   *
   * Bei der Wärme mit Vorzeichen: Dort ist 0 die Mitte, und ohne das "+"
   * sähe "40 %" nach wenig aus statt nach deutlich wärmer.
   */
  displayOf(slider: Slider): string {
    const percent = Math.round(this.adjustments()[slider.key] * 100);
    if (slider.scale !== 'signed') return `${percent} %`;
    return percent > 0 ? `+${percent} %` : `${percent} %`;
  }

  isUntouched(): boolean {
    return isDefault(this.adjustments());
  }

  onSlider(key: keyof Adjustments, raw: string): void {
    this.changed.emit({ ...this.adjustments(), [key]: Number(raw) });
  }
}
