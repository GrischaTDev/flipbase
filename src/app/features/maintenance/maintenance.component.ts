import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input } from '@angular/core';
import { LucideDynamicIcon, LucideWrench as Wrench } from '@lucide/angular';
import { platformFeatureArea } from '../../core/models/platform-feature.model';
import { PlatformFeatureSwitchService } from '../../core/services/platform-feature-switch.service';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';

/** Seite für einen Bereich, den der Betreiber vorübergehend geschlossen hat. */
@Component({
  selector: 'app-maintenance',
  imports: [LucideDynamicIcon, ButtonComponent, CardComponent],
  templateUrl: './maintenance.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaintenanceComponent implements OnInit {
  private readonly switches = inject(PlatformFeatureSwitchService);

  /** Kommt aus dem Routenparameter :feature. */
  readonly feature = input<string>('');

  readonly wrenchIcon = Wrench;
  readonly area = computed(() => platformFeatureArea(this.feature()));
  readonly message = computed(() => {
    const area = this.area();
    return (
      (area && this.switches.switches().find((entry) => entry.key === area.key))
        ?.maintenanceMessage ?? null
    );
  });

  ngOnInit(): void {
    void this.switches.refresh(0).catch(() => undefined);
  }
}
