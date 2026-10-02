import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { WorkspaceAccessService } from '../../../core/services/workspace-access.service';
import { ButtonComponent } from '../../../shared/components/button/button.component';

@Component({
  selector: 'app-beta-ended',
  imports: [ButtonComponent, TranslatePipe],
  templateUrl: './beta-ended.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BetaEndedComponent {
  readonly access = inject(WorkspaceAccessService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  readonly currentLanguage = signal(this.translate.currentLang() || 'de');
  readonly ended = computed(() =>
    this.access.access().some((row) => row.access_status === 'ended'),
  );
  readonly loading = signal(false);
  readonly message = signal<string | null>(null);

  switchLanguage(language: string): void {
    this.currentLanguage.set(language);
    this.translate.use(language);
  }

  async retry(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.message.set(null);
    try {
      const rows = await this.access.refresh();
      if (rows.some((row) => row.access_status === 'active'))
        await this.router.navigate(['/dashboard']);
      else this.message.set('BETA.NO_ACCESS');
    } catch {
      this.message.set('BETA.CHECK_FAILED');
    } finally {
      this.loading.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/auth/login']);
  }
}
