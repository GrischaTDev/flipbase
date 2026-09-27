import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { MarketplaceBrowserTestStore } from '../../services/marketplace-browser-test.store';

@Component({
  selector: 'app-marketplace-browser-test',
  imports: [
    ButtonComponent,
    CardComponent,
    NoticeBannerComponent,
    TextFieldComponent,
    ReactiveFormsModule,
  ],
  providers: [MarketplaceBrowserTestStore],
  templateUrl: './marketplace-browser-test.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class MarketplaceBrowserTestComponent {
  private credentialsConnectionId: string | undefined;
  readonly store = inject(MarketplaceBrowserTestStore);
  readonly loginForm = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(256)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(256)],
    }),
  });

  constructor() {
    void this.store.checkAvailability();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void this.store.checkLogin();
    }, 3000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(interval);
      this.loginForm.reset();
    });
    effect(() => {
      const connectionId = this.store.connection()?.connectionId;
      if (connectionId === this.credentialsConnectionId) return;
      this.credentialsConnectionId = connectionId;
      this.loginForm.reset();
    });
  }

  async login(): Promise<void> {
    if (this.loginForm.invalid || !this.store.canLogin()) return;
    const credentials = this.loginForm.getRawValue();
    this.loginForm.reset();
    try {
      await this.store.login(credentials);
    } finally {
      credentials.username = '';
      credentials.password = '';
    }
  }
}
