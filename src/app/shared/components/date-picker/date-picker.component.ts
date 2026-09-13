import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  forwardRef,
  inject,
  input,
  model,
  signal,
  viewChild,
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
    '(keydown.escape)': 'onEscape($event)',
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
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('calendarTrigger');
  private readonly calendar = viewChild<ElementRef<HTMLElement>>('calendar');
  private readonly calendarGrid = viewChild<ElementRef<HTMLElement>>('calendarGrid');
  private static nextInstanceId = 0;
  private readonly instanceId = ++DatePickerComponent.nextInstanceId;
  protected readonly supportsPopover =
    typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';
  protected readonly calendarPosition = signal({ left: 0, top: 0, maxHeight: 400 });

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
  readonly focusedDate = signal<string | null>(null);

  // Backward-compatible signal aliases
  readonly istOffen = this.isOpen;
  readonly angezeigterMonat = this.displayedMonth;

  readonly effectiveId = computed(() => this.id() || this.feldId());
  readonly resolvedInputId = computed(
    () => this.effectiveId() || `fb-date-picker-${this.instanceId}`,
  );
  readonly calendarId = computed(() => `${this.resolvedInputId()}-calendar`);
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
  readonly weeks = computed(() => {
    const days = this.days();
    return Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  });

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    // Scrollen im Kalender bleibt möglich; bei bewegtem Anker wird er geschlossen.
    const onScroll = (event: Event) => {
      if (this.calendar()?.nativeElement.contains(event.target as Node)) return;
      this.close(false);
    };
    const onResize = () => this.close(false);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    });
  }

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
    if (this.isOpen()) this.close();
    else this.openCalendar();
  }
  schalteUm(event: MouseEvent): void {
    this.toggle(event);
  }

  close(restoreFocus = true): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.onTouched();
    if (restoreFocus) {
      queueMicrotask(() => this.trigger()?.nativeElement.focus({ preventScroll: true }));
    }
  }
  schliesse(): void {
    this.close();
  }

  onEscape(event: Event): void {
    if (!this.isOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
  }

  private openCalendar(): void {
    const date = this.value() || this.toIso(new Date());
    const parsed = this.fromIso(date);
    if (parsed) this.displayedMonth.set(parsed);
    this.focusedDate.set(date);
    this.calendarPosition.set({ left: 0, top: 0, maxHeight: window.innerHeight - 16 });
    this.isOpen.set(true);
    afterNextRender(
      () => {
        const panel = this.calendar()?.nativeElement;
        if (!this.isOpen() || !panel) return;
        if (this.supportsPopover) {
          // Die oberste Browserebene entkommt Overflow und Transform der Karten/Dialoge.
          panel.showPopover();
          const anchor = this.elementRef.nativeElement.getBoundingClientRect();
          const margin = 8;
          const gap = 8;
          const below = Math.max(0, window.innerHeight - anchor.bottom - gap - margin);
          const above = Math.max(0, anchor.top - gap - margin);
          const openAbove = panel.offsetHeight > below && above > below;
          const maxHeight = openAbove ? above : below;
          this.calendarPosition.set({
            left: Math.max(
              margin,
              Math.min(anchor.left, window.innerWidth - panel.offsetWidth - margin),
            ),
            top: openAbove
              ? Math.max(margin, anchor.top - gap - Math.min(panel.offsetHeight, maxHeight))
              : anchor.bottom + gap,
            maxHeight,
          });
        }
        this.focusFocusedDateAfterRender();
      },
      { injector: this.injector },
    );
  }

  navigateMonth(step: number): void {
    const d = new Date(this.displayedMonth());
    d.setMonth(d.getMonth() + step);
    this.displayedMonth.set(d);
    const focus = this.focusedDate() ? this.fromIso(this.focusedDate() as string) : null;
    this.focusedDate.set(
      this.toIso(new Date(d.getFullYear(), d.getMonth(), focus?.getDate() ?? 1)),
    );
    this.focusFocusedDateAfterRender();
  }
  blaettere(step: number): void {
    this.navigateMonth(step);
  }

  selectDate(date: string): void {
    this.value.set(date);
    this.focusedDate.set(date || null);
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
      this.close(false);
    }
  }
  beiKlickAusserhalb(event: MouseEvent): void {
    this.onClickOutside(event);
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (this.effectiveDisabled()) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.isOpen()) {
        this.openCalendar();
      }
    }
  }

  onCalendarKeydown(event: KeyboardEvent, date: string): void {
    if (event.key === 'Escape') {
      this.onEscape(event);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectDate(date);
      return;
    }

    const current = this.fromIso(date);
    if (!current) return;

    let next: Date;
    switch (event.key) {
      case 'ArrowLeft':
        next = this.addDays(current, -1);
        break;
      case 'ArrowRight':
        next = this.addDays(current, 1);
        break;
      case 'ArrowUp':
        next = this.addDays(current, -7);
        break;
      case 'ArrowDown':
        next = this.addDays(current, 7);
        break;
      case 'Home':
        next = this.addDays(current, -((current.getDay() + 6) % 7));
        break;
      case 'End':
        next = this.addDays(current, 6 - ((current.getDay() + 6) % 7));
        break;
      case 'PageUp':
        next = this.addMonths(current, -1);
        break;
      case 'PageDown':
        next = this.addMonths(current, 1);
        break;
      default:
        return;
    }

    event.preventDefault();
    const iso = this.toIso(next);
    this.focusedDate.set(iso);
    if (
      next.getMonth() !== this.displayedMonth().getMonth() ||
      next.getFullYear() !== this.displayedMonth().getFullYear()
    ) {
      this.displayedMonth.set(new Date(next.getFullYear(), next.getMonth(), 1));
    }
    this.focusFocusedDateAfterRender();
  }

  dateAriaLabel(date: string): string {
    const parsed = this.fromIso(date);
    return parsed
      ? parsed.toLocaleDateString('de-DE', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : date;
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

  onBlur(event: Event): void {
    this.onInput(event);
    this.onTouched();
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
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.getFullYear() === parts[0] &&
      date.getMonth() === parts[1] - 1 &&
      date.getDate() === parts[2]
      ? date
      : null;
  }

  private addDays(date: Date, amount: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  private addMonths(date: Date, amount: number): Date {
    const next = new Date(date);
    next.setDate(1);
    next.setMonth(next.getMonth() + amount);
    return next;
  }

  private focusFocusedDateAfterRender(): void {
    afterNextRender(
      {
        mixedReadWrite: () => {
          const grid = this.calendarGrid()?.nativeElement;
          const targetDate = this.focusedDate() || this.days()[0]?.date;
          const button = targetDate
            ? grid?.querySelector<HTMLButtonElement>(`[data-date="${targetDate}"]`)
            : null;
          button?.focus({ preventScroll: true });
        },
      },
      { injector: this.injector },
    );
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
