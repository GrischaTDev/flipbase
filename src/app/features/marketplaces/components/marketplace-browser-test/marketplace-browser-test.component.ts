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
  readonly text = new FormControl('', { nonNullable: true });
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
      this.text.reset();
    });
    effect(() => {
      const connectionId = this.store.connection()?.connectionId;
      if (connectionId === this.credentialsConnectionId) return;
      this.credentialsConnectionId = connectionId;
      this.loginForm.reset();
      this.text.reset();
    });
  }

  async login(): Promise<void> {
    if (this.loginForm.invalid || this.store.busy()) return;
    const credentials = this.loginForm.getRawValue();
    this.loginForm.reset();
    try {
      await this.store.login(credentials);
    } finally {
      credentials.username = '';
      credentials.password = '';
    }
  }

  clickFrame(event: MouseEvent): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement) || !this.store.canAct()) return;
    const rectangle = target.getBoundingClientRect();
    if (rectangle.width <= 0 || rectangle.height <= 0) return;
    const x = event.detail === 0 ? 0.5 : (event.clientX - rectangle.left) / rectangle.width;
    const y = event.detail === 0 ? 0.5 : (event.clientY - rectangle.top) / rectangle.height;
    void this.store.input({
      kind: 'click',
      x: Math.max(0, Math.min(0.999999, x)),
      y: Math.max(0, Math.min(0.999999, y)),
    });
  }

  sendText(): void {
    const value = this.text.value;
    if (!value || value.length > 256) return;
    this.text.reset('');
    void this.store.input({ kind: 'type', value });
  }
}
