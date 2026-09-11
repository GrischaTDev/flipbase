import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Size, PlatformProfile, PlatformId, Rect } from '../../models/platform-profile';
import { NEUTRAL_LOOK, planOutput, RenderPlan, renderImage } from '../../services/image-renderer';
import { Look } from '../../services/adjustments';
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
  /**
   * Die vollstaendige Bildwirkung: CSS-Filter plus Waerme und Schaerfe.
   * Als ein Wert, damit Vorschau und Export nicht auseinanderlaufen koennen.
   */
  readonly look = input<Look>(NEUTRAL_LOOK);
  /** `tile` in der Reihe unter dem Bild, `full` im Fenster fuer die Grossansicht. */
  readonly variant = input<'tile' | 'full'>('tile');
  /** Ob dies die Plattform ist, die der Cropper gerade bearbeitet - nur fuer `tile`. */
  readonly isActive = input(false);
  /** Aufloesung, die die Mindestmasse der Plattform unterschreitet - oder null. */
  readonly issue = input<{ width: number; height: number } | null>(null);
  /** Waehrend eines Exports gesperrt - Klicks liefen sonst ins Leere. */
  readonly disabled = input(false);

  readonly selected = output<PlatformId>();
  readonly enlargeRequested = output<PlatformId>();

  readonly previewUrl = signal<string | null>(null);
  readonly outputSize = signal<Size | null>(null);
  readonly isRendering = signal(true);
  readonly hasPreviewError = signal(false);

  /** Buendelt Reglerbewegungen: erst nach dieser Ruhezeit wird tatsaechlich gerendert. */
  private static readonly RENDER_DEBOUNCE_MS = 120;
  /** Das Overlay erscheint nur, wenn ein Rendervorgang laenger als das hier dauert. */
  private static readonly OVERLAY_DELAY_MS = 150;

  private currentPreviewUrl: string | null = null;
  private renderVersion = 0;
  private destroyed = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private overlayTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.renderVersion++;
      if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
      if (this.overlayTimer !== null) clearTimeout(this.overlayTimer);
      if (this.currentPreviewUrl) URL.revokeObjectURL(this.currentPreviewUrl);
    });

    effect(() => {
      const url = this.dataUrl();
      const crop = this.crop();
      const platform = this.platform();
      const look = this.look();
      this.scheduleRender(url, crop, platform, look);
    });
  }

  /**
   * Ein Regler feuert `(input)` bei jeder Mausbewegung. Ohne Buendelung
   * wuerde jede dieser Bewegungen einen vollen Decode+Encode-Durchlauf
   * ausloesen. Ein neuer Aufruf innerhalb der Ruhezeit verwirft deshalb den
   * noch nicht gestarteten vorherigen - gerendert wird erst der letzte Stand.
   */
  private scheduleRender(
    url: string,
    crop: Rect | null,
    platform: PlatformProfile,
    look: Look,
  ): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.renderPreview(url, crop, platform, look);
    }, PlatformPreviewComponent.RENDER_DEBOUNCE_MS);
  }

  private async renderPreview(
    url: string,
    crop: Rect | null,
    platform: PlatformProfile,
    look: Look,
  ): Promise<void> {
    const version = ++this.renderVersion;
    this.hasPreviewError.set(false);

    // Das dunkle Overlay wird erst gesetzt, wenn der Rendervorgang spuerbar
    // dauert. Eine schnelle Aktualisierung soll die zuletzt gueltige
    // Vorschau nicht kurz hinter einem Schleier verstecken - genau das war
    // beim Ziehen eines Reglers vorher staendig der Fall.
    this.overlayTimer = setTimeout(() => {
      this.overlayTimer = null;
      if (!this.destroyed && version === this.renderVersion) this.isRendering.set(true);
    }, PlatformPreviewComponent.OVERLAY_DELAY_MS);

    try {
      const image = await this.loadImage(url);
      const size = { width: image.naturalWidth, height: image.naturalHeight };
      const plan = planPreview(crop, size, platform);
      if (!plan) return;

      const blob = await renderImage(image, plan, 0.92, look);
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
      if (this.overlayTimer !== null) {
        clearTimeout(this.overlayTimer);
        this.overlayTimer = null;
      }
      if (!this.destroyed && version === this.renderVersion) this.isRendering.set(false);
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
