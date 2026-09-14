import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import { NumberInputComponent } from '../../../../shared/components/number-input/number-input.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { QueryDraft, SniperQuery, queryDraftError } from '../../models/sniper-query.model';

@Component({
  selector: 'app-sniper-query-editor',
  imports: [ReactiveFormsModule, TextFieldComponent, NumberInputComponent, ButtonComponent],
  templateUrl: './sniper-query-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SniperQueryEditorComponent {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly query = input<SniperQuery | null>(null);
  readonly saving = input(false);
  readonly saved = output<QueryDraft>();
  readonly cancelled = output<void>();
  readonly editing = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    brandId: new FormControl<number | null>(null),
    intervalSeconds: new FormControl(20, { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    afterNextRender(() =>
      this.element.nativeElement.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus(),
    );
    effect(() => {
      const query = this.query();
      if (query) this.edit(query);
    });
  }

  edit(query: SniperQuery): void {
    this.editing.set(query.id);
    this.form.reset({
      title: query.title || (query.brand_id ? `Marke ${query.brand_id}` : ''),
      brandId: query.brand_id,
      intervalSeconds: query.poll_interval_ms / 1000,
      notes: query.notes ?? '',
    });
    this.form.controls.brandId.disable();
  }

  submit(): void {
    if (this.saving()) return;
    const draft = { id: this.editing(), ...this.form.getRawValue() };
    const error = queryDraftError(draft);
    this.error.set(error);
    if (!error) this.saved.emit(draft);
  }
}
