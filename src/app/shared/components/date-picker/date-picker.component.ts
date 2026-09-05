import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  LucideDynamicIcon,
  LucideCalendar as Calendar,
  LucideChevronLeft as ChevronLeft,
  LucideChevronRight as ChevronRight,
} from '@lucide/angular';

export interface DayItem {
  date: string;
  dayNumber: number;
  isOutside: boolean;
  isToday: boolean;
  isSelected: boolean;
  // Backward-compatible properties
  datum: string;
  zahl: number;
  ausserhalb: boolean;
  heute: boolean;
  gewaehlt: boolean;
}

/**
 * Modern DatePicker component following Shopify Polaris design principles.
 */
@Component({
  selector: 'app-date-picker',
  imports: [LucideDynamicIcon],
  templateUrl: './date-picker.component.html',
  styleUrl: './date-picker.component.scss',
  host: {
    class: 'block relative',
    '(document:click)': 'onClickOutside($event)',
    '(document:keydown.escape)': 'close()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatePickerComponent),
      multi: true,
    },
  ],
})
export class DatePickerComponent implements ControlValueAccessor {
  private readonly elementRef = inject(ElementRef);

  /** Date as ISO string (YYYY-MM-DD) */
  readonly value = model<string | null>(null);

  // Canonical English Inputs
  readonly id = input<string>('');
  readonly placeholder = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly ariaLabel = input<string>('');

  // Backward-compatible German Inputs
  readonly feldId = input<string>('');
  readonly platzhalter = input<string>('TT.MM.JJJJ');

  readonly isOpen = signal<boolean>(false);
  readonly isAccessorDisabled = signal<boolean>(false);
  readonly displayedMonth = signal<Date>(new Date());

  // Backward-compatible signal aliases
  readonly istOffen = this.isOpen;
  readonly angezeigterMonat = this.displayedMonth;

  readonly effectiveId = computed(() => this.id() || this.feldId());
  readonly effectivePlaceholder = computed(() => this.placeholder() || this.platzhalter());
  readonly effectiveDisabled = computed(() => this.disabled() || this.isAccessorDisabled());
  readonly effectiveAriaLabel = computed(() => this.ariaLabel());

  readonly weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  readonly wochentage = this.weekdays;

  readonly monthName = computed(() =>
    this.displayedMonth().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
  );
  readonly monatsName = this.monthName;

  readonly displayValue = computed(() => {
    const val = this.value();
    if (!val) return '';
    const d = this.fromIso(val);
    return d
      ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';
  });
  readonly anzeige = this.displayValue;

  readonly days = computed<DayItem[]>(() => {
    const month = this.displayedMonth();
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - offset);

    const today = this.toIso(new Date());
    const selected = this.value();
    const list: DayItem[] = [];

    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = this.toIso(d);
      const isOutside = d.getMonth() !== month.getMonth();
      const isToday = iso === today;
      const isSelected = iso === selected;

      list.push({
        date: iso,
        dayNumber: d.getDate(),
        isOutside,
        isToday,
        isSelected,
        datum: iso,
        zahl: d.getDate(),
        ausserhalb: isOutside,
        heute: isToday,
        gewaehlt: isSelected,
      });
    }
    return list;
  });
  readonly tage = this.days;

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(val: string | null): void {
    this.value.set(val);
    if (val) {
      const d = this.fromIso(val);
      if (d) this.displayedMonth.set(d);
    }
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isAccessorDisabled.set(isDisabled);
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    if (this.effectiveDisabled()) return;
    this.isOpen.update((o) => !o);
  }
  schalteUm(event: MouseEvent): void {
    this.toggle(event);
  }

  close(): void {
    this.isOpen.set(false);
  }
  schliesse(): void {
    this.close();
  }

  navigateMonth(step: number): void {
    const d = new Date(this.displayedMonth());
    d.setMonth(d.getMonth() + step);
    this.displayedMonth.set(d);
  }
  blaettere(step: number): void {
    this.navigateMonth(step);
  }

  selectDate(date: string): void {
    this.value.set(date);
    this.onChange(date);
    this.close();
  }
  waehle(date: string): void {
    this.selectDate(date);
  }

  selectToday(): void {
    const today = this.toIso(new Date());
    this.selectDate(today);
    this.displayedMonth.set(new Date());
  }
  waehleHeute(): void {
    this.selectToday();
  }

  onClickOutside(event: MouseEvent): void {
    if (!this.isOpen()) return;
    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.close();
    }
  }
  beiKlickAusserhalb(event: MouseEvent): void {
    this.onClickOutside(event);
  }

  onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value.trim();
    if (!text) {
      this.value.set(null);
      this.onChange(null);
      return;
    }
    const parts = text.split(/[./-]/);
    if (parts.length === 3) {
      let day = parts[0];
      let month = parts[1];
      let year = parts[2];
      if (day.length === 4) {
        const tmp = day;
        day = year;
        year = tmp;
      }
      if (year.length === 2) year = '20' + year;
      day = day.padStart(2, '0');
      month = month.padStart(2, '0');
      const iso = `${year}-${month}-${day}`;
      const d = this.fromIso(iso);
      if (d && !isNaN(d.getTime())) {
        this.value.set(iso);
        this.displayedMonth.set(d);
        this.onChange(iso);
      }
    }
  }
  beiEingabe(event: Event): void {
    this.onInput(event);
  }

  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  private alsIso(d: Date): string {
    return this.toIso(d);
  }

  private fromIso(iso: string): Date | null {
    const parts = iso.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  private ausIso(iso: string): Date | null {
    return this.fromIso(iso);
  }

  protected readonly calendarIcon = Calendar;
  protected readonly prevIcon = ChevronLeft;
  protected readonly nextIcon = ChevronRight;

  // Backward-compatible icon aliases
  protected readonly kalenderIcon = this.calendarIcon;
  protected readonly zurueckIcon = this.prevIcon;
  protected readonly weiterIcon = this.nextIcon;
}
