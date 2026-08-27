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
  ausschnitt: Rect | null,
  bildgroesse: Size | null,
  zielverhaeltnis: number,
): Rect | null {
  const basis =
    ausschnitt ??
    (bildgroesse ? { x: 0, y: 0, width: bildgroesse.width, height: bildgroesse.height } : null);
  return basis ? deriveRect(basis, zielverhaeltnis) : null;
}

/** Die Vorschau verwendet exakt denselben Renderplan wie der spätere Export. */
export function planPreview(
  ausschnitt: Rect | null,
  bildgroesse: Size | null,
  plattform: PlatformProfile,
): RenderPlan | null {
  const quelle = resolvePreviewRect(ausschnitt, bildgroesse, plattform.exportRatio);
  return quelle ? planOutput(quelle, plattform) : null;
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
      const ausschnitt = this.ausschnitt();
      const plattform = this.plattform();
      void this.renderPreview(url, ausschnitt, plattform);
    });
  }

  private async renderPreview(
    url: string,
    ausschnitt: Rect | null,
    plattform: PlatformProfile,
  ): Promise<void> {
    const version = ++this.renderVersion;
    this.isRendering.set(true);
    this.hasPreviewError.set(false);

    try {
      const bild = await this.loadImage(url);
      const groesse = { width: bild.naturalWidth, height: bild.naturalHeight };
      const plan = planPreview(ausschnitt, groesse, plattform);
      if (!plan) return;

      const blob = await renderImage(bild, plan);
      if (this.zerstoert || version !== this.renderVersion) return;

      const neueUrl = URL.createObjectURL(blob);
      const alteUrl = this.aktuelleVorschauUrl;
      this.aktuelleVorschauUrl = neueUrl;
      this.previewUrl.set(neueUrl);
      this.outputSize.set({ width: plan.width, height: plan.height });
      if (alteUrl) URL.revokeObjectURL(alteUrl);
    } catch {
      if (!this.zerstoert && version === this.renderVersion) {
        this.hasPreviewError.set(true);
      }
    } finally {
      if (!this.zerstoert && version === this.renderVersion) this.isRendering.set(false);
    }
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((aufloesen, ablehnen) => {
      const bild = new Image();
      bild.onload = () => aufloesen(bild);
      bild.onerror = () => ablehnen(new Error('Die Vorschau ließ sich nicht erzeugen.'));
      bild.src = url;
    });
  }
}
