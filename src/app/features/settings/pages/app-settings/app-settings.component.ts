import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActionOverviewPreferencesService } from '../../../../core/services/action-overview-preferences.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { CustomCheckboxComponent } from '../../../../shared/components/custom-checkbox/custom-checkbox.component';
import { FormFieldComponent } from '../../../../shared/components/form-field/form-field.component';

@Component({
  selector: 'app-app-settings',
  imports: [ButtonComponent, CardComponent, CustomCheckboxComponent, FormFieldComponent],
  templateUrl: './app-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AppSettingsComponent {
  readonly preferences = inject(ActionOverviewPreferencesService);
}
