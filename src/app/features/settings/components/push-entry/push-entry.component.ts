import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PushNavigationService } from '../../../../core/services/push-navigation.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

@Component({
  selector: 'app-push-entry',
  imports: [ButtonComponent],
  templateUrl: './push-entry.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PushEntryComponent {
  readonly navigation = inject(PushNavigationService);
  constructor() {
    const serialized = inject(ActivatedRoute).snapshot.queryParamMap.get('context');
    if (serialized && serialized.length <= 4096) {
      try {
        this.navigation.enqueue(JSON.parse(serialized));
      } catch {
        this.navigation.message.set('Diese Benachrichtigung konnte nicht gelesen werden.');
      }
    } else this.navigation.restore();
    void this.navigation.openPending();
  }
}
