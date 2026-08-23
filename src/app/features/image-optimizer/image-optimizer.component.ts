import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { LucideDynamicIcon, LucideCheck as Check } from '@lucide/angular';
import { PLATTFORM_PROFILE, PlattformProfil, ProfilId, Rechteck } from './models/plattform-profile';
import { ZuschnittEditorComponent } from './components/zuschnitt-editor/zuschnitt-editor.component';
import { PlattformVorschauComponent } from './components/plattform-vorschau/plattform-vorschau.component';

/** Ein hochgeladenes Bild mit seinem Zuschnitt. */
export interface OptimiererBild {
  readonly id: string;
  readonly datei: File;
  readonly datenUrl: string;
  /** Ausschnitt in Originalpixeln. Null, solange nichts gesetzt wurde. */
  readonly ausschnitt: Rechteck | null;
}

/**
 * Bereitet Produktfotos fuer die Verkaufsplattformen auf.
 *
 * Alles laeuft im Browser: Die Dateien werden nur gelesen, nichts wird
 * hochgeladen. Deshalb funktioniert das Werkzeug auch ohne Anmeldung am
 * Server und liesse sich spaeter eigenstaendig veroeffentlichen.
 */
@Component({
  selector: 'app-image-optimizer',
  imports: [LucideDynamicIcon, ZuschnittEditorComponent, PlattformVorschauComponent],
  templateUrl: './image-optimizer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageOptimizerComponent {
  readonly profile = PLATTFORM_PROFILE;

  readonly checkIcon = Check;

  readonly bilder = signal<OptimiererBild[]>([]);
  readonly gewaehlteIds = signal<ProfilId[]>(['ebay']);
  readonly aktivesBildId = signal<string | null>(null);

  readonly gewaehlteProfile = computed<PlattformProfil[]>(() =>
    this.profile.filter((p) => this.gewaehlteIds().includes(p.id)),
  );

  readonly aktivesBild = computed<OptimiererBild | null>(
    () => this.bilder().find((b) => b.id === this.aktivesBildId()) ?? null,
  );

  /** Ob mindestens eine gewaehlte Plattform tatsaechlich beschneidet. */
  readonly esWirdGeschnitten = computed<boolean>(() =>
    this.gewaehlteProfile().some((p) => p.schneidet),
  );

  schaltePlattform(id: ProfilId): void {
    this.gewaehlteIds.update((ids) =>
      ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id],
    );
  }

  async nimmDateien(dateien: FileList | null): Promise<void> {
    if (!dateien) return;

    const neue: OptimiererBild[] = [];
    for (const datei of Array.from(dateien)) {
      if (!datei.type.startsWith('image/')) continue;
      neue.push({
        id: crypto.randomUUID(),
        datei,
        datenUrl: URL.createObjectURL(datei),
        ausschnitt: null,
      });
    }

    this.bilder.update((liste) => [...liste, ...neue]);
    if (!this.aktivesBildId() && neue.length > 0) {
      this.aktivesBildId.set(neue[0].id);
    }
  }

  entferne(id: string): void {
    const betroffen = this.bilder().find((b) => b.id === id);
    if (betroffen) URL.revokeObjectURL(betroffen.datenUrl);

    this.bilder.update((liste) => liste.filter((b) => b.id !== id));
    if (this.aktivesBildId() === id) {
      this.aktivesBildId.set(this.bilder()[0]?.id ?? null);
    }
  }

  merkeAusschnitt(id: string, ausschnitt: Rechteck): void {
    this.bilder.update((liste) => liste.map((b) => (b.id === id ? { ...b, ausschnitt } : b)));
  }
}
