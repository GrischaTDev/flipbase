import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
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
import { ActionStatusIndicatorComponent } from '../../../../shared/components/action-status-indicator/action-status-indicator.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { LoadingIndicatorComponent } from '../../../../shared/components/loading-indicator/loading-indicator.component';
import { NoticeBannerComponent } from '../../../../shared/components/notice-banner/notice-banner.component';
import { ModalShellComponent } from '../../../../shared/components/modal-shell/modal-shell.component';
import { VintedActionOverviewHeaderStore } from '../../services/vinted-action-overview-header.store';
import { KleinanzeigenExtensionBridge } from '../../services/kleinanzeigen-extension-bridge';
import { KleinanzeigenActionStore } from '../../services/kleinanzeigen-action.store';
import { VintedListingOperationStore } from '../../services/vinted-listing-operation.store';
import { VintedActionOverviewComponent } from '../vinted-action-overview/vinted-action-overview.component';
import { VintedListingActionOverviewComponent } from '../vinted-listing-action-overview/vinted-listing-action-overview.component';

@Component({
  selector: 'app-vinted-action-overview-menu',
  imports: [
    NgOptimizedImage,
    NgTemplateOutlet,
    ActionStatusIndicatorComponent,
    ButtonComponent,
    LoadingIndicatorComponent,
    NoticeBannerComponent,
    ModalShellComponent,
    VintedActionOverviewComponent,
    VintedListingActionOverviewComponent,
  ],
  templateUrl: './vinted-action-overview-menu.component.html',
  providers: [KleinanzeigenExtensionBridge],
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
  readonly extension = inject(KleinanzeigenExtensionBridge);
  readonly kleinanzeigen = inject(KleinanzeigenActionStore);
  readonly listingOperations = inject(VintedListingOperationStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  readonly opened = signal(false);
  readonly mobile = signal(window.innerWidth < 640);
  readonly count = computed(
    () =>
      this.store.count() +
      this.kleinanzeigen.runningCount() +
      this.listingOperations.runningCount(),
  );
  readonly hasRunning = computed(
    () =>
      this.store.hasRunning() ||
      this.kleinanzeigen.runningCount() > 0 ||
      this.listingOperations.runningCount() > 0,
  );
  readonly hasFailure = computed(
    () =>
      this.kleinanzeigen.hasFailure() ||
      !!this.store.error() ||
      this.store
        .groups()
        .some((group) =>
          group.actions.some((action) => ['failed', 'outcome_unknown'].includes(action.state)),
        ) ||
      this.store.listings().some(({ job }) => ['failed', 'outcome_unknown'].includes(job.state)),
  );
  readonly label = computed(() => `Laufende Aktionen (${this.count()})`);
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
    // Der Klickpfad bleibt gültig, auch wenn ein Ausblenden-Knopf seine Zeile schon entfernt hat.
    if (!this.mobile() && !event.composedPath().includes(this.host.nativeElement))
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
