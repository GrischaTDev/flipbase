import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { MarketplaceBrowserTestStore } from '../../services/marketplace-browser-test.store';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';

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
  readonly accounts = inject(MarketplaceAccountStore);
  readonly compact = input(false);
  readonly reconnectOnOpen = input(false);
  readonly pendingAccountName = input<string | null>(null);
  readonly connectionCreated = output<string>();
  readonly submitting = signal(false);
  readonly reconnectRequested = signal(false);
  readonly canSubmitLogin = computed(() =>
    this.pendingAccountName()
      ? this.store.available() &&
        !this.store.readOnly() &&
        this.accounts.canManage() &&
        !this.submitting()
      : this.store.canLogin(),
  );
  readonly showProgress = computed(
    () => this.submitting() || (this.store.awaitingLogin() && !this.store.awaitingVerification()),
  );
  readonly code = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^[0-9]{4,8}$/)],
  });
  readonly codeForm = new FormGroup({ code: this.code });
  readonly manualTextInput = new FormControl('', { nonNullable: true });
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
      if (document.visibilityState === 'visible') {
        const wasAwaitingLogin = this.store.awaitingLogin();
        void this.store.checkLogin().then(() => {
          if (wasAwaitingLogin) this.finishReauthentication();
        });
      }
    }, 3000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(interval);
      this.loginForm.reset();
      this.code.reset();
      this.manualTextInput.reset();
    });
    effect(() => {
      const connectionId = this.store.connection()?.connectionId;
      if (connectionId === this.credentialsConnectionId) return;
      this.credentialsConnectionId = connectionId;
      this.loginForm.reset();
      this.code.reset();
      this.manualTextInput.reset();
      this.reconnectRequested.set(
        this.reconnectOnOpen() && this.store.connection()?.status === 'connected',
      );
    });
  }

  async login(): Promise<void> {
    if (this.loginForm.invalid || !this.canSubmitLogin()) return;
    const credentials = this.loginForm.getRawValue();
    this.submitting.set(true);
    try {
      const pendingName = this.pendingAccountName();
      if (pendingName) {
        if (!(await this.accounts.createConnection(pendingName))) return;
        const connectionId = this.accounts.selectedConnection()?.connectionId;
        if (!connectionId) return;
        this.connectionCreated.emit(connectionId);
      }
      this.loginForm.reset();
      await this.store.login(credentials);
      this.finishReauthentication();
    } finally {
      this.submitting.set(false);
      credentials.username = '';
      credentials.password = '';
    }
  }

  async verifyCode(): Promise<void> {
    if (this.code.invalid || !this.store.awaitingVerification()) return;
    const code = this.code.value;
    this.code.reset();
    await this.store.verifyCode(code);
  }

  private finishReauthentication(): void {
    if (
      this.reconnectRequested() &&
      !this.store.session() &&
      !this.store.error() &&
      !this.store.busy() &&
      this.store.connection()?.status === 'connected'
    )
      this.reconnectRequested.set(false);
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

  sendManualText(): void {
    const value = this.manualTextInput.value;
    if (!value || value.length > 256) return;
    this.manualTextInput.reset('');
    void this.store.input({ kind: 'type', value });
  }

  sendKey(key: 'Enter' | 'Tab' | 'Escape' | 'Backspace'): void {
    void this.store.input({ kind: 'press', key });
  }

  async openManualBrowser(): Promise<void> {
    await this.store.start(true);
  }
}
