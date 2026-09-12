import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { LucideImage } from '@lucide/angular';
import { placePreview } from './image-preview-position';

/** Verzögerung, damit beim Überfliegen einer Liste nichts aufblitzt. */
const OPEN_DELAY_MS = 200;
/** Kurze Gnadenfrist, damit der Zeiger die Lücke zur Vorschau überqueren kann. */
const CLOSE_DELAY_MS = 120;

let nextPreviewId = 0;

@Component({
  selector: 'app-product-thumbnail',
  imports: [LucideImage],
  templateUrl: './product-thumbnail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0 align-middle' },
})
export class ProductThumbnailComponent {
  readonly src = input<string | null>(null);
  readonly alt = input('');
  readonly size = input<'sm' | 'md'>('sm');
  readonly imageFailed = output<void>();
  readonly failed = linkedSignal({ source: this.src, computation: () => false });
  readonly imageSource = computed(() => (this.failed() ? null : this.src()?.trim() || null));

  readonly previewId = `product-preview-${nextPreviewId++}`;
  readonly previewOpen = signal(false);
  readonly previewLeft = signal(0);
  readonly previewTop = signal(0);
  readonly previewSize = signal(320);
  readonly previewLabel = computed(() =>
    this.alt().trim() ? `${this.alt()} vergrößert ansehen` : 'Bild vergrößert ansehen',
  );

  private timer: ReturnType<typeof setTimeout> | null = null;
  private activePreview: HTMLElement | null = null;
  private readonly dismiss = () => this.close();
  // Escape muss die Vorschau schliessen (WCAG 1.4.13). Die eingebaute
  // Popover-Abweisung greift nicht, solange der Fokus woanders steht.
  private readonly dismissOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.close();
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.clearTimer();
      this.close();
    });
  }

  onPointerEnter(event: PointerEvent, trigger: HTMLElement, preview: HTMLElement): void {
    // Auf Touchgeräten übernimmt der Tipp; ein simuliertes Überfahren zählt nicht.
    if (event.pointerType !== 'mouse') return;
    this.schedule(() => this.open(trigger, preview), OPEN_DELAY_MS);
  }

  onPointerLeave(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    this.schedule(() => this.close(), CLOSE_DELAY_MS);
  }

  onClick(trigger: HTMLElement, preview: HTMLElement): void {
    this.clearTimer();
    if (this.previewOpen()) this.close();
    else this.open(trigger, preview);
  }

  onFocus(trigger: HTMLElement, preview: HTMLElement): void {
    // Nur echter Tastaturfokus öffnet; ein Mausklick fokussiert ebenfalls.
    try {
      if (!trigger.matches(':focus-visible')) return;
    } catch {
      return;
    }
    this.clearTimer();
    this.open(trigger, preview);
  }

  onBlur(): void {
    this.clearTimer();
    this.close();
  }

  /** Der Zeiger darf auf der Vorschau ruhen, ohne dass sie verschwindet (WCAG 1.4.13). */
  onPreviewEnter(): void {
    this.clearTimer();
  }

  onPreviewLeave(): void {
    this.schedule(() => this.close(), CLOSE_DELAY_MS);
  }

  /** Der Browser kann ein Popover selbst schließen, etwa bei Escape. */
  onPreviewToggle(event: Event): void {
    if ((event as ToggleEvent).newState === 'open' || !this.previewOpen()) return;
    this.previewOpen.set(false);
    this.activePreview = null;
    this.stopWatching();
  }

  private open(trigger: HTMLElement, preview: HTMLElement): void {
    if (this.previewOpen() || !this.imageSource()) return;
    const placement = placePreview(trigger.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    this.previewLeft.set(placement.left);
    this.previewTop.set(placement.top);
    this.previewSize.set(placement.size);
    this.previewOpen.set(true);
    this.activePreview = preview;
    if (typeof preview.showPopover === 'function') {
      try {
        preview.showPopover();
      } catch {
        // Ein bereits offenes Popover ist kein Fehler.
      }
    }
    window.addEventListener('scroll', this.dismiss, { capture: true, passive: true });
    window.addEventListener('resize', this.dismiss, { passive: true });
    document.addEventListener('keydown', this.dismissOnEscape, true);
  }

  private close(): void {
    if (!this.previewOpen()) return;
    this.previewOpen.set(false);
    const preview = this.activePreview;
    this.activePreview = null;
    if (preview && typeof preview.hidePopover === 'function') {
      try {
        preview.hidePopover();
      } catch {
        // Ein bereits geschlossenes Popover ist kein Fehler.
      }
    }
    this.stopWatching();
  }

  private schedule(action: () => void, delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      action();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private stopWatching(): void {
    window.removeEventListener('scroll', this.dismiss, { capture: true });
    window.removeEventListener('resize', this.dismiss);
    document.removeEventListener('keydown', this.dismissOnEscape, true);
  }
}
