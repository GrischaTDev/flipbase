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
import { Groesse, PlattformProfil, Rechteck } from '../../models/plattform-profile';
import { planeAusgabe, RenderPlan, rendereBild } from '../../services/bild-renderer';
import { leiteAb } from '../../services/zuschnitt';

export function ermittleVorschauAusschnitt(
  ausschnitt: Rechteck | null,
  bildgroesse: Groesse | null,
  zielverhaeltnis: number,
): Rechteck | null {
  const basis =
    ausschnitt ??
    (bildgroesse ? { x: 0, y: 0, breite: bildgroesse.breite, hoehe: bildgroesse.hoehe } : null);
  return basis ? leiteAb(basis, zielverhaeltnis) : null;
}

/** Die Vorschau verwendet exakt denselben Renderplan wie der spätere Export. */
export function planeVorschau(
  ausschnitt: Rechteck | null,
  bildgroesse: Groesse | null,
  plattform: PlattformProfil,
): RenderPlan | null {
  const quelle = ermittleVorschauAusschnitt(ausschnitt, bildgroesse, plattform.exportVerhaeltnis);
  return quelle ? planeAusgabe(quelle, plattform) : null;
}

@Component({
  selector: 'app-plattform-vorschau',
  imports: [],
  templateUrl: './plattform-vorschau.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlattformVorschauComponent {
  readonly plattform = input.required<PlattformProfil>();
  readonly datenUrl = input.required<string>();
  readonly ausschnitt = input<Rechteck | null>(null);

  readonly vorschauUrl = signal<string | null>(null);
  readonly ausgabeGroesse = signal<Groesse | null>(null);
  readonly wirdGerendert = signal(true);
  readonly vorschauFehler = signal(false);
  readonly seitenverhaeltnis = computed(() => this.plattform().kachelVerhaeltnis);

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
      void this.rendereVorschau(url, ausschnitt, plattform);
    });
  }

  private async rendereVorschau(
    url: string,
    ausschnitt: Rechteck | null,
    plattform: PlattformProfil,
  ): Promise<void> {
    const version = ++this.renderVersion;
    this.wirdGerendert.set(true);
    this.vorschauFehler.set(false);

    try {
      const bild = await this.ladeBild(url);
      const groesse = { breite: bild.naturalWidth, hoehe: bild.naturalHeight };
      const plan = planeVorschau(ausschnitt, groesse, plattform);
      if (!plan) return;

      const blob = await rendereBild(bild, plan);
      if (this.zerstoert || version !== this.renderVersion) return;

      const neueUrl = URL.createObjectURL(blob);
      const alteUrl = this.aktuelleVorschauUrl;
      this.aktuelleVorschauUrl = neueUrl;
      this.vorschauUrl.set(neueUrl);
      this.ausgabeGroesse.set({ breite: plan.breite, hoehe: plan.hoehe });
      if (alteUrl) URL.revokeObjectURL(alteUrl);
    } catch {
      if (!this.zerstoert && version === this.renderVersion) {
        this.vorschauFehler.set(true);
      }
    } finally {
      if (!this.zerstoert && version === this.renderVersion) this.wirdGerendert.set(false);
    }
  }

  private ladeBild(url: string): Promise<HTMLImageElement> {
    return new Promise((aufloesen, ablehnen) => {
      const bild = new Image();
      bild.onload = () => aufloesen(bild);
      bild.onerror = () => ablehnen(new Error('Die Vorschau ließ sich nicht erzeugen.'));
      bild.src = url;
    });
  }
}
