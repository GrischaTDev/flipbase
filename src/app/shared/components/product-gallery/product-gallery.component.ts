import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { ButtonComponent } from '../button/button.component';
import { ModalShellComponent } from '../modal-shell/modal-shell.component';
import { ProductThumbnailComponent } from '../product-thumbnail/product-thumbnail.component';

@Component({
  selector: 'app-product-gallery',
  imports: [ButtonComponent, ModalShellComponent, ProductThumbnailComponent],
  templateUrl: './product-gallery.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0',
    '(keydown.arrowleft)': 'navigate($event, -1)',
    '(keydown.arrowright)': 'navigate($event, 1)',
  },
})
export class ProductGalleryComponent {
  readonly images = input<readonly string[]>([]);
  readonly title = input.required<string>();
  readonly previewImages = computed(() => this.images().slice(0, 5));
  readonly selectedIndex = linkedSignal<readonly string[], number | null>({
    source: this.images,
    computation: () => null,
  });
  readonly currentImage = computed(() => {
    const index = this.selectedIndex();
    return index === null ? null : (this.images()[index] ?? null);
  });
  readonly previousIcon = LucideChevronLeft;
  readonly nextIcon = LucideChevronRight;
  private readonly position = viewChild<ElementRef<HTMLElement>>('position');
  open(index: number): void {
    if (index >= 0 && index < this.images().length) this.selectedIndex.set(index);
  }
  close(): void {
    this.selectedIndex.set(null);
  }
  move(direction: number): void {
    const current = this.selectedIndex();
    if (current === null) return;
    const next = current + direction;
    if (next < 0 || next >= this.images().length) return;
    // Der bisher fokussierte Navigationsbutton wird an der Grenze deaktiviert.
    // Vorher auf den stabilen Fotozähler wechseln, damit die Pfeiltasten weiter funktionieren.
    if (next === 0 || next === this.images().length - 1)
      this.position()?.nativeElement.focus({ preventScroll: true });
    this.open(next);
  }
  navigate(event: Event, direction: number): void {
    if (this.selectedIndex() === null) return;
    event.preventDefault();
    event.stopPropagation();
    this.move(direction);
  }
}
