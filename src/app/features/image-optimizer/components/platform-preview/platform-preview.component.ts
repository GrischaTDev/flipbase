import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Size, PlatformProfile, Rect, ratioLabel } from '../../models/platform-profile';
import { planOutput, RenderPlan, renderImage } from '../../services/image-renderer';
import { deriveRect } from '../../services/crop';

export function resolvePreviewRect(
  crop: Rect | null,
  imageSize: Size | null,
  targetRatio: number,
): Rect | null {
  const basis =
    crop ?? (imageSize ? { x: 0, y: 0, width: imageSize.width, height: imageSize.height } : null);
  return basis ? deriveRect(basis, targetRatio) : null;
}

/** Die Vorschau verwendet exakt denselben Renderplan wie der spätere Export. */
export function planPreview(
  crop: Rect | null,
  imageSize: Size | null,
  platform: PlatformProfile,
): RenderPlan | null {
  const source = resolvePreviewRect(crop, imageSize, platform.exportRatio);
  return source ? planOutput(source, platform) : null;
}

@Component({
  selector: 'app-platform-preview',
  imports: [],
  templateUrl: './platform-preview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformPreviewComponent {
  readonly platform = input.required<PlatformProfile>();
  readonly dataUrl = input.required<string>();
  readonly crop = input<Rect | null>(null);

  readonly previewUrl = signal<string | null>(null);
  readonly outputSize = signal<Size | null>(null);
  readonly isRendering = signal(true);
  readonly hasPreviewError = signal(false);

  private currentPreviewUrl: string | null = null;
  private renderVersion = 0;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.renderVersion++;
      if (this.currentPreviewUrl) URL.revokeObjectURL(this.currentPreviewUrl);
    });

    effect(() => {
      const url = this.dataUrl();
      const crop = this.crop();
      const platform = this.platform();
      void this.renderPreview(url, crop, platform);
    });
  }

  private async renderPreview(
    url: string,
    crop: Rect | null,
    platform: PlatformProfile,
  ): Promise<void> {
    const version = ++this.renderVersion;
    this.isRendering.set(true);
    this.hasPreviewError.set(false);

    try {
      const image = await this.loadImage(url);
      const size = { width: image.naturalWidth, height: image.naturalHeight };
      const plan = planPreview(crop, size, platform);
      if (!plan) return;

      const blob = await renderImage(image, plan);
      if (this.destroyed || version !== this.renderVersion) return;

      const newUrl = URL.createObjectURL(blob);
      const oldUrl = this.currentPreviewUrl;
      this.currentPreviewUrl = newUrl;
      this.previewUrl.set(newUrl);
      this.outputSize.set({ width: plan.width, height: plan.height });
      if (oldUrl) URL.revokeObjectURL(oldUrl);
    } catch {
      if (!this.destroyed && version === this.renderVersion) {
        this.hasPreviewError.set(true);
      }
    } finally {
      if (!this.destroyed && version === this.renderVersion) this.isRendering.set(false);
    }
  }

  /** Templates koennen keine freien Funktionen aufrufen, deshalb die Weiterleitung. */
  ratioLabel(platform: PlatformProfile): string {
    return ratioLabel(platform);
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Die Vorschau ließ sich nicht erzeugen.'));
      image.src = url;
    });
  }
}
