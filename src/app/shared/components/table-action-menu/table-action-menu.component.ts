import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { LucideEllipsis, type LucideIconInput } from '@lucide/angular';
import { ButtonComponent } from '../button/button.component';

let nextMenuId = 0;

@Component({
  selector: 'app-table-action-menu',
  imports: [ButtonComponent],
  templateUrl: './table-action-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex align-middle',
    '(document:click)': 'onOutsideClick($event)',
    '(click)': 'onActionClick($event)',
    '(keydown)': 'onKeydown($event)',
    '(focusout)': 'onFocusOut($event)',
    '(window:resize)': 'close(false)',
  },
})
export class TableActionMenuComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  readonly label = input('Aktionen');
  readonly panelId = `table-action-menu-${++nextMenuId}`;
  readonly triggerIcon = input<LucideIconInput>(LucideEllipsis);
  readonly disabled = input(false);
  readonly isOpen = signal(false);
  readonly position = signal({ top: 0, left: 0 });

  toggle(): void {
    if (this.disabled()) return;
    if (this.isOpen()) {
      this.close();
      return;
    }
    this.isOpen.set(true);
    afterNextRender(
      () => {
        const panel = this.panel()?.nativeElement;
        const trigger = this.trigger();
        if (!panel || !trigger) return;
        panel.showPopover?.();
        const rect = trigger.getBoundingClientRect();
        const height = Math.min(panel.scrollHeight, window.innerHeight - 16);
        this.position.set({
          top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - height - 8)),
          left: Math.max(
            8,
            Math.min(rect.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 8),
          ),
        });
        this.controls()[0]?.focus();
      },
      { injector: this.injector },
    );
  }

  close(restoreFocus = true): void {
    if (!this.isOpen()) return;
    this.panel()?.nativeElement.hidePopover?.();
    this.isOpen.set(false);
    if (restoreFocus) this.trigger()?.focus();
  }

  onOutsideClick(event: MouseEvent): void {
    if (event.target instanceof Node && !this.host.nativeElement.contains(event.target))
      this.close(false);
  }

  onActionClick(event: MouseEvent): void {
    if (
      event.target instanceof Element &&
      this.panel()?.nativeElement.contains(event.target) &&
      event.target.closest('button:not(:disabled), a[href]')
    )
      this.close();
  }

  onFocusOut(event: FocusEvent): void {
    if (
      event.relatedTarget instanceof Node &&
      !this.host.nativeElement.contains(event.relatedTarget)
    )
      this.close(false);
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    const controls = this.controls();
    const current = controls.indexOf(document.activeElement as HTMLElement);
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? controls.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1) % controls.length
            : event.key === 'ArrowUp'
              ? (current - 1 + controls.length) % controls.length
              : null;
    if (index !== null) {
      event.preventDefault();
      controls[index]?.focus();
    }
  }

  private trigger(): HTMLButtonElement | null {
    return this.host.nativeElement.querySelector('app-button > button');
  }

  private controls(): HTMLElement[] {
    return Array.from(
      this.panel()?.nativeElement.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ??
        [],
    );
  }
}
