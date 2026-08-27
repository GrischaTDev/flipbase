import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Size, PlatformProfile, Rect } from '../../models/platform-profile';
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
  readonly plattform = input.required<PlatformProfile>();
  readonly datenUrl = input.required<string>();
  readonly ausschnitt = input<Rect | null>(null);

  readonly previewUrl = signal<string | null>(null);
  readonly outputSize = signal<Size | null>(null);
  readonly isRendering = signal(true);
  readonly hasPreviewError = signal(false);
  readonly seitenverhaeltnis = computed(() => this.plattform().tileRatio);

  private aktuelleVorschauUrl: string | null = null;
  private renderVersion = 0;
  private zerstoert = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.zerstoert = true;
      this.renderVersion++;
      if (this.aktuelleVorschauUrl) URL.revokeObjectURL(this.aktuelleVorschauUrl);
    });

    effect(() => {
      const url = this.datenUrl();
      const crop = this.ausschnitt();
      const platform = this.plattform();
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
      if (this.zerstoert || version !== this.renderVersion) return;

      const newUrl = URL.createObjectURL(blob);
      const oldUrl = this.aktuelleVorschauUrl;
      this.aktuelleVorschauUrl = newUrl;
      this.previewUrl.set(newUrl);
      this.outputSize.set({ width: plan.width, height: plan.height });
      if (oldUrl) URL.revokeObjectURL(oldUrl);
    } catch {
      if (!this.zerstoert && version === this.renderVersion) {
        this.hasPreviewError.set(true);
      }
    } finally {
      if (!this.zerstoert && version === this.renderVersion) this.isRendering.set(false);
    }
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
