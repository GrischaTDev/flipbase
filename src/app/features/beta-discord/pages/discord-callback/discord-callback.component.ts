import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BetaDiscordService } from '../../services/beta-discord.service';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-discord-callback',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './discord-callback.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscordCallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly discord = inject(BetaDiscordService);
  readonly failed = signal(false);

  async ngOnInit(): Promise<void> {
    const query = this.route.snapshot.queryParamMap;
    const code = query.get('code');
    const state = query.get('state');
    const denied = query.get('error');
    window.history.replaceState(null, '', '/auth/discord-callback');
    if (!code || !state || denied) {
      await this.router.navigate(['/onboarding/discord'], {
        queryParams: { discord: 'failed' },
        replaceUrl: true,
      });
      return;
    }
    try {
      await this.discord.complete(code, state);
      await this.router.navigate(['/onboarding/discord'], {
        queryParams: { discord: 'connected' },
        replaceUrl: true,
      });
    } catch {
      this.failed.set(true);
      await this.router.navigate(['/onboarding/discord'], {
        queryParams: { discord: 'failed' },
        replaceUrl: true,
      });
    }
  }
}
