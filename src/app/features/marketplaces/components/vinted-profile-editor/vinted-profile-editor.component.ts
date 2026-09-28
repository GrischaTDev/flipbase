import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { MarketplaceAccountStore } from '../../services/marketplace-account.store';

@Component({
  selector: 'app-vinted-profile-editor',
  imports: [ReactiveFormsModule, ButtonComponent, NoticeBannerComponent, TextFieldComponent],
  templateUrl: './vinted-profile-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedProfileEditorComponent {
  readonly connectionId = input.required<string>();
  readonly store = inject(MarketplaceAccountStore);
  private readonly builder = inject(FormBuilder);
  readonly form = this.builder.nonNullable.group({ about: ['', [Validators.maxLength(2000)]] });
  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal(false);
  private readonly originalAbout = signal('');

  constructor() {
    effect(() => {
      this.connectionId();
      untracked(() => {
        this.editing.set(false);
        this.saved.set(false);
        this.error.set(null);
      });
    });
  }

  async open(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    const connectionId = this.connectionId();
    try {
      const profile = this.store.snapshot()?.profile;
      const about =
        profile?.connectionId === connectionId && profile.bioState === 'loaded'
          ? (profile.bio ?? '')
          : await this.store.readProfileAbout(connectionId);
      if (
        this.connectionId() !== connectionId ||
        this.store.selectedConnection()?.connectionId !== connectionId
      )
        return;
      this.form.setValue({ about });
      this.originalAbout.set(about);
      this.editing.set(true);
    } catch (error) {
      if (this.connectionId() === connectionId)
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Das Profilformular konnte nicht geladen werden.',
        );
    } finally {
      this.busy.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const connectionId = this.connectionId();
    try {
      await this.store.saveProfileAbout(
        connectionId,
        this.form.controls.about.value,
        this.originalAbout(),
      );
      if (this.connectionId() !== connectionId) return;
      this.editing.set(false);
      this.saved.set(true);
    } catch (error) {
      if (this.connectionId() === connectionId)
        this.error.set(
          error instanceof Error
            ? error.message
            : 'Die Profiländerung konnte nicht bestätigt werden.',
        );
    } finally {
      this.busy.set(false);
    }
  }
}
