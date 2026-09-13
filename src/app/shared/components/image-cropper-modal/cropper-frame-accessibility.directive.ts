import {
  AfterRenderRef,
  DestroyRef,
  Directive,
  ElementRef,
  Injector,
  Renderer2,
  afterNextRender,
  inject,
} from '@angular/core';

/** Ergänzt die fehlende Rolle des beschrifteten Tastaturrahmens in ngx-image-cropper 9. */
@Directive({
  selector: 'image-cropper[appCropperFrameAccessibility]',
  exportAs: 'appCropperFrameAccessibility',
})
export class CropperFrameAccessibilityDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly injector = inject(Injector);
  private scheduled: AfterRenderRef | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.scheduled?.destroy());
  }

  updateFrame(): void {
    this.scheduled?.destroy();
    // cropperReady wird ausgelöst, bevor Angular den Rahmen in den DOM einsetzt.
    this.scheduled = afterNextRender(
      {
        write: () => {
          const frame = this.element.nativeElement.querySelector<HTMLElement>('.ngx-ic-cropper');
          if (frame) this.renderer.setAttribute(frame, 'role', 'group');
          this.scheduled = null;
        },
      },
      { injector: this.injector },
    );
  }
}
