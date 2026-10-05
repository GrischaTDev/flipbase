import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { MarketplaceBrowserTestStore } from '../../services/marketplace-browser-test.store';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';
import type { BrowserDragPoint } from '../../services/marketplace-browser-test-api.service';

interface BrowserPointerGesture {
  sessionId: string;
  pointerId: number;
  target: HTMLElement;
  rectangle: DOMRect;
  startedAt: number;
  startX: number;
  startY: number;
  hasMoved: boolean;
  sampleIntervalMs: number;
  points: BrowserDragPoint[];
}

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
  private pointerGesture: BrowserPointerGesture | null = null;
  private focusedInteractionSessionId: string | null = null;
  private readonly browserPreview = viewChild<ElementRef<HTMLElement>>('browserPreview');
  readonly pointerPosition = signal<{ x: number; y: number } | null>(null);
  readonly pointerMessage = signal<string | null>(null);
  readonly store = inject(MarketplaceBrowserTestStore);
  readonly accounts = inject(MarketplaceAccountStore);
  readonly compact = input(false);
  readonly reconnectOnOpen = input(false);
  readonly pendingAccountName = input<string | null>(null);
  readonly cloudSetupId = input<string | null>(null);
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
    () =>
      !this.store.session()?.frameUrl &&
      (this.submitting() || (this.store.awaitingLogin() && !this.store.awaitingVerification())),
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
    effect(() => this.store.configureCloudSetup(this.cloudSetupId()));
    void this.store.checkAvailability();
    const interval = setInterval(() => {
      // Eine sichtbare Browseransicht bleibt für manuelle Eingaben frei.
      if (
        document.visibilityState === 'visible' &&
        !this.store.manualLogin() &&
        !this.pointerGesture &&
        !this.store.session()?.frameUrl
      ) {
        const wasAwaitingLogin = this.store.awaitingLogin();
        void this.store.checkLogin().then(() => {
          if (wasAwaitingLogin) this.finishReauthentication();
        });
      }
    }, 3000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(interval);
      this.resetPointer();
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
    effect(() => {
      const sessionId = this.store.session()?.id;
      if (this.pointerGesture && sessionId !== this.pointerGesture.sessionId) this.resetPointer();
    });
    afterRenderEffect({
      write: () => {
        const shouldFocusBrowser = this.store.interactionRequired() || this.store.manualLogin();
        const sessionId = this.store.session()?.id;
        const preview = this.browserPreview()?.nativeElement;
        if (!shouldFocusBrowser) {
          this.focusedInteractionSessionId = null;
          return;
        }
        if (!sessionId || !preview || this.focusedInteractionSessionId === sessionId) return;
        this.focusedInteractionSessionId = sessionId;
        preview.focus({ preventScroll: true });
        preview.scrollIntoView({ block: 'nearest' });
      },
    });
  }

  async login(): Promise<void> {
    if (this.loginForm.invalid || !this.canSubmitLogin()) return;
    const credentials = this.loginForm.getRawValue();
    this.submitting.set(true);
    try {
      const pendingName = this.pendingAccountName();
      if (pendingName) {
        const connectionId = await this.accounts.createConnection(pendingName);
        if (!connectionId) return;
        if (this.accounts.selectedConnection()?.connectionId !== connectionId) return;
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
    // Zeigerklicks werden bereits beim Loslassen übertragen; Tastaturklicks bleiben nutzbar.
    if (event.detail !== 0 || this.pointerGesture) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement) || !this.store.canAct()) return;
    const rectangle = target.getBoundingClientRect();
    if (rectangle.width <= 0 || rectangle.height <= 0) return;
    void this.store.input({ kind: 'click', x: 0.5, y: 0.5 });
  }

  startPointer(event: PointerEvent): void {
    const target = event.currentTarget;
    const session = this.store.session();
    if (
      !(target instanceof HTMLElement) ||
      !session ||
      !this.store.canAct() ||
      this.store.readOnly() ||
      this.pointerGesture ||
      !event.isPrimary ||
      event.button !== 0
    )
      return;
    const rectangle = target.getBoundingClientRect();
    if (rectangle.width <= 0 || rectangle.height <= 0) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
    target.setPointerCapture(event.pointerId);
    this.pointerGesture = {
      sessionId: session.id,
      pointerId: event.pointerId,
      target,
      rectangle,
      startedAt: event.timeStamp,
      startX: event.clientX,
      startY: event.clientY,
      hasMoved: false,
      sampleIntervalMs: 32,
      points: [{ ...this.pointerCoordinates(event, rectangle), elapsedMs: 0 }],
    };
    this.pointerMessage.set(null);
    this.pointerPosition.set(this.pointerCoordinates(event, rectangle));
  }

  movePointer(event: PointerEvent): void {
    this.recordPointer(event);
  }

  async endPointer(event: PointerEvent): Promise<void> {
    const gesture = this.recordPointer(event, true);
    if (!gesture) return;
    this.resetPointer();
    if (!gesture.hasMoved) {
      const first = gesture.points[0];
      if (first) await this.store.input({ kind: 'click', x: first.x, y: first.y });
      return;
    }
    if (gesture.points.length < 2) return;
    if (!this.store.dragSupported()) {
      this.pointerMessage.set(
        'Die Ziehfunktion ist momentan nicht verfügbar. Bitte versuche es später erneut.',
      );
      return;
    }
    this.pointerMessage.set('Deine Ziehbewegung wird übertragen …');
    await this.store.input({ kind: 'drag', points: gesture.points });
    this.pointerMessage.set(null);
  }

  cancelPointer(event: PointerEvent): void {
    if (event.pointerId === this.pointerGesture?.pointerId) this.resetPointer();
  }

  private recordPointer(event: PointerEvent, isFinal = false): BrowserPointerGesture | null {
    const gesture = this.pointerGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return null;
    if (!this.store.canAct() || this.store.session()?.id !== gesture.sessionId) {
      this.resetPointer();
      return null;
    }
    const elapsedMs = Math.floor(event.timeStamp - gesture.startedAt);
    if (elapsedMs > 15_000 || elapsedMs < 0) {
      this.resetPointer();
      this.pointerMessage.set(
        'Die Bewegung wurde abgebrochen. Bitte ziehe erneut und lasse innerhalb von 15 Sekunden los.',
      );
      return null;
    }
    gesture.hasMoved ||=
      Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 3;
    const coordinates = this.pointerCoordinates(event, gesture.rectangle);
    this.pointerPosition.set(coordinates);
    const previous = gesture.points.at(-1);
    if (isFinal && previous && elapsedMs === previous.elapsedMs && gesture.points.length > 1)
      gesture.points[gesture.points.length - 1] = { ...coordinates, elapsedMs };
    if (
      !previous ||
      elapsedMs <= previous.elapsedMs ||
      (!isFinal && elapsedMs - previous.elapsedMs < gesture.sampleIntervalMs)
    )
      return gesture;
    // Bei langen Gesten behalten wir nur echte Messpunkte, ohne zusätzliche Positionen zu erzeugen.
    if (gesture.points.length >= 127) {
      gesture.points = gesture.points.filter((_, index) => index % 2 === 0);
      gesture.sampleIntervalMs *= 2;
    }
    gesture.points.push({ ...coordinates, elapsedMs });
    return gesture;
  }

  private pointerCoordinates(event: PointerEvent, rectangle: DOMRect): { x: number; y: number } {
    const normalize = (coordinate: number) =>
      Math.max(0, Math.min(0.999999, Math.round(coordinate * 1_000_000) / 1_000_000));
    return {
      x: normalize((event.clientX - rectangle.left) / rectangle.width),
      y: normalize((event.clientY - rectangle.top) / rectangle.height),
    };
  }

  private resetPointer(): void {
    const gesture = this.pointerGesture;
    this.pointerGesture = null;
    this.pointerPosition.set(null);
    if (gesture?.target.hasPointerCapture(gesture.pointerId))
      gesture.target.releasePointerCapture(gesture.pointerId);
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
    this.loginForm.reset();
    this.code.reset();
    this.manualTextInput.reset();
    await this.store.startManualLogin();
  }
}
