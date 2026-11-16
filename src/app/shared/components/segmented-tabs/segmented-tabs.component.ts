import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  model,
} from '@angular/core';

export interface SegmentedTab {
  readonly value: string;
  readonly label: string;
  readonly count?: number;
}

/**
 * Umschalter zwischen gleichrangigen Ansichten derselben Fläche (Rolle „tablist“).
 * Pfeiltasten, Pos1 und Ende wechseln wie bei nativen Reitern; nur der aktive Reiter ist fokussierbar.
 */
@Component({
  selector: 'app-segmented-tabs',
  templateUrl: './segmented-tabs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class SegmentedTabsComponent {
  readonly tabs = input.required<readonly SegmentedTab[]>();
  readonly label = input.required<string>();
  /** Präfix für die IDs der Reiter und ihrer Inhaltsflächen (`<präfix>-panel-<wert>`). */
  readonly idPrefix = input.required<string>();
  readonly value = model.required<string>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  select(value: string): void {
    this.value.set(value);
  }

  onKeydown(event: KeyboardEvent): void {
    const tabs = this.tabs();
    const index = tabs.findIndex((tab) => tab.value === this.value());
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    this.value.set(tabs[next]!.value);
    queueMicrotask(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>(`#${this.idPrefix()}-tab-${tabs[next]!.value}`)
        ?.focus(),
    );
  }
}
