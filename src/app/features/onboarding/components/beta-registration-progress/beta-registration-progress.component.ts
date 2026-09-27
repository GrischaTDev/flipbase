import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-beta-registration-progress',
  imports: [TranslatePipe],
  templateUrl: './beta-registration-progress.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BetaRegistrationProgressComponent {
  readonly step = input.required<1 | 2 | 3>();

  readonly steps = [
    { number: 1, label: 'BETA_ONBOARDING.PASSWORD' },
    { number: 2, label: 'BETA_ONBOARDING.WORKSPACE' },
    { number: 3, label: 'BETA_ONBOARDING.DISCORD' },
  ] as const;
}
