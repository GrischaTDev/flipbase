import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DatePickerComponent } from '../../../../shared/components/date-picker/date-picker.component';
import { TextFieldComponent } from '../../../../shared/components/text-field/text-field.component';
import {
  CustomSelectComponent,
  type SelectOption,
} from '../../../../shared/components/custom-select/custom-select.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import {
  resolveVintedListingSchedule,
  selectVintedListingSchedule,
  type VintedListingLatePolicy,
} from '../../models/vinted-listing-schedule';

export interface VintedListingScheduleSelection {
  readonly scheduledAt: string;
  readonly timeZone: string;
  readonly latePolicy: VintedListingLatePolicy;
}
@Component({
  selector: 'app-vinted-listing-schedule-dialog',
  templateUrl: './vinted-listing-schedule-dialog.component.html',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    DatePickerComponent,
    TextFieldComponent,
    CustomSelectComponent,
    ModalShellComponent,
    NoticeBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VintedListingScheduleDialogComponent {
  readonly initial = input<VintedListingScheduleSelection | null>(null);
  readonly busy = input(false);
  readonly serverError = input<string | null>(null);
  readonly now = input<() => number>(Date.now);
  readonly selected = output<VintedListingScheduleSelection>();
  readonly closed = output<void>();
  readonly error = signal<string | null>(null);
  readonly form = new FormGroup({
    date: new FormControl<string | null>(null),
    time: new FormControl('', { nonNullable: true }),
    timeZone: new FormControl('Europe/Berlin', { nonNullable: true }),
    latePolicy: new FormControl<VintedListingLatePolicy>('pause_after_30_minutes', {
      nonNullable: true,
    }),
    occurrence: new FormControl<'earlier' | 'later' | null>(null),
  });
  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  readonly resolution = computed(() => {
    const values = this.values();
    return resolveVintedListingSchedule({
      date: values.date ?? '',
      time: values.time ?? '',
      timeZone: values.timeZone?.trim() ?? '',
    });
  });
  readonly occurrenceOptions = computed<readonly SelectOption<'earlier' | 'later'>[]>(() => {
    const resolution = this.resolution();
    if (resolution.kind !== 'ambiguous') return [];
    return resolution.choices.map((choice, index) => ({
      value: index === 0 ? 'earlier' : 'later',
      label:
        (index === 0 ? 'Früheres' : 'Späteres') +
        ' Vorkommen · ' +
        new Intl.DateTimeFormat('de-DE', {
          timeZone: resolution.timeZone,
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        }).format(new Date(choice.scheduledAt)) +
        ' · ' +
        choice.scheduledAt,
    }));
  });
  readonly lateOptions: readonly SelectOption<VintedListingLatePolicy>[] = [
    { value: 'pause_after_30_minutes', label: 'Bei mehr als 30 Minuten Verspätung anhalten' },
    {
      value: 'publish_when_available',
      label: 'Veröffentlichen, sobald die Ausführung verfügbar ist',
    },
  ];
  constructor() {
    let wallKey = this.wallKey();
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const next = this.wallKey();
      this.error.set(null);
      if (next !== wallKey) {
        wallKey = next;
        this.form.controls.occurrence.setValue(null);
      }
    });
    effect(() => {
      const initial = this.initial();
      untracked(() => {
        if (initial) {
          const wall = this.wallTime(Date.parse(initial.scheduledAt), initial.timeZone);
          this.form.reset({
            ...wall,
            timeZone: initial.timeZone,
            latePolicy: initial.latePolicy,
            occurrence: null,
          });
          const resolution = resolveVintedListingSchedule({ ...wall, timeZone: initial.timeZone });
          if (resolution.kind === 'ambiguous')
            this.form.controls.occurrence.setValue(
              Date.parse(resolution.choices[0].scheduledAt) === Date.parse(initial.scheduledAt)
                ? 'earlier'
                : 'later',
            );
        }
      });
    });
    effect(() => {
      if (this.busy()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
  }
  submit(): void {
    if (this.busy()) return;
    const value = this.form.getRawValue();
    try {
      if (!['pause_after_30_minutes', 'publish_when_available'].includes(value.latePolicy))
        throw new Error('Bitte wähle die Regel für einen verpassten Termin.');
      const schedule = selectVintedListingSchedule(
        { date: value.date ?? '', time: value.time, timeZone: value.timeZone.trim() },
        this.now()(),
        value.occurrence ?? undefined,
      );
      this.error.set(null);
      this.selected.emit({ ...schedule, latePolicy: value.latePolicy });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Bitte prüfe Deinen Termin.');
    }
  }
  close(): void {
    if (!this.busy()) this.closed.emit();
  }
  quickTime(minutes: 60 | 180): void {
    if (this.busy()) return;
    try {
      this.form.patchValue(
        this.wallTime(this.now()() + minutes * 60_000, this.form.controls.timeZone.value.trim()),
      );
    } catch {
      this.error.set('Bitte prüfe Deine Zeitzone.');
    }
  }
  private wallKey(): string {
    const value = this.form.getRawValue();
    return JSON.stringify([value.date, value.time, value.timeZone]);
  }
  private wallTime(instant: number, timeZone: string): { date: string; time: string } {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      calendar: 'iso8601',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const value = (type: string) => parts.find((part) => part.type === type)!.value;
    return {
      date: value('year') + '-' + value('month') + '-' + value('day'),
      time: value('hour') + ':' + value('minute'),
    };
  }
}
