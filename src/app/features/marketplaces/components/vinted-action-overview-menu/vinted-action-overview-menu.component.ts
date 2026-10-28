import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { LucideListTodo, LucideLoader2, LucideX, type LucideIconData } from '@lucide/angular';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { VintedActionOverviewHeaderStore } from '../../services/vinted-action-overview-header.store';
import { VintedActionOverviewComponent } from '../vinted-action-overview/vinted-action-overview.component';
import { VintedListingActionOverviewComponent } from '../vinted-listing-action-overview/vinted-listing-action-overview.component';

@Component({
  selector: 'app-vinted-action-overview-menu',
  imports: [
    NgTemplateOutlet,
    ButtonComponent,
    LoadingIndicatorComponent,
    NoticeBannerComponent,
    ModalShellComponent,
    VintedActionOverviewComponent,
    VintedListingActionOverviewComponent,
  ],
  templateUrl: './vinted-action-overview-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative inline-flex',
    '(document:click)': 'onOutsideClick($event)',
    '(document:keydown.escape)': 'onEscape($event)',
    '(focusout)': 'onFocusOut($event)',
  },
})
export class VintedActionOverviewMenuComponent {
  readonly store = inject(VintedActionOverviewHeaderStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  readonly opened = signal(false);
  readonly mobile = signal(window.innerWidth < 640);
  readonly label = computed(() => `Laufende Aktionen (${this.store.count()})`);
  readonly queueIcon = LucideListTodo;
  readonly runningIcon: LucideIconData = {
    ...LucideLoader2.icon,
    node: LucideLoader2.icon.node.map(([element, attributes]) => [
      element,
      { ...attributes, class: 'origin-center animate-spin motion-reduce:animate-none' },
    ]),
  };
  readonly closeIcon = LucideX;

  constructor() {
    const resize = () => this.mobile.set(window.innerWidth < 640);
    window.addEventListener('resize', resize);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('resize', resize));
    effect(() => {
      this.store.context();
      this.mobile();
      untracked(() => this.close());
    });
  }

  toggle(): void {
    if (this.opened()) return this.close();
    this.opened.set(true);
    void this.store.refresh();
    if (!this.mobile())
      afterNextRender(
        () => {
          this.host.nativeElement
            .querySelector<HTMLElement>('[data-action-overview-panel] button')
            ?.focus();
        },
        { injector: this.injector },
      );
  }

  close(restoreFocus = true): void {
    if (!this.opened()) return;
    this.opened.set(false);
    if (restoreFocus)
      this.host.nativeElement
        .querySelector<HTMLElement>('[data-action-overview-trigger] button')
        ?.focus();
  }

  onOutsideClick(event: MouseEvent): void {
    if (
      !this.mobile() &&
      event.target instanceof Node &&
      !this.host.nativeElement.contains(event.target)
    )
      this.close(false);
  }
  onEscape(event: Event): void {
    if (!this.opened()) return;
    event.stopPropagation();
    this.close();
  }
  onFocusOut(event: FocusEvent): void {
    if (
      !this.mobile() &&
      event.relatedTarget instanceof Node &&
      !this.host.nativeElement.contains(event.relatedTarget)
    )
      this.close(false);
  }
}
