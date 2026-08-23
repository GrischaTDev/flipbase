import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideDynamicIcon, LucideUserCheck as UserCheck, LucideX as X } from '@lucide/angular';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Sagt, wer angemeldet ist, wenn die Sitzung beim Start aus dem Speicher kam.
 *
 * Ohne diesen Hinweis fuehrte ein Klick auf "Anmelden" wortlos ins Dashboard -
 * richtig, aber verwirrend, und auf einem geteilten Rechner arbeitet man dann
 * unbemerkt im Konto eines anderen.
 *
 * Bewusst kein Dialog: Der Streifen laeuft im Seitenfluss mit und
 * unterbricht die Arbeit nicht.
 */
@Component({
  selector: 'app-session-hint-banner',
  imports: [LucideDynamicIcon],
  templateUrl: './session-hint-banner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionHintBannerComponent {
  private readonly auth = inject(AuthService);

  private readonly weggeklickt = signal(false);

  readonly sichtbar = computed(() => this.auth.sitzungWiederhergestellt() && !this.weggeklickt());
  readonly email = computed(() => this.auth.userEmail());

  readonly userIcon = UserCheck;
  readonly closeIcon = X;

  schliessen(): void {
    this.weggeklickt.set(true);
  }

  async abmelden(): Promise<void> {
    await this.auth.signOut();
  }
}
