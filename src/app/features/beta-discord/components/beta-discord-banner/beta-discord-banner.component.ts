import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LucideDynamicIcon, LucideMessageCircle as MessageCircle } from '@lucide/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BetaDiscordService } from '../../services/beta-discord.service';

@Component({
  selector: 'app-beta-discord-banner',
  imports: [ButtonComponent, LucideDynamicIcon, TranslatePipe],
  templateUrl: './beta-discord-banner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BetaDiscordBannerComponent implements OnInit {
  private readonly discord = inject(BetaDiscordService);
  private readonly route = inject(ActivatedRoute);

  readonly discordIcon = MessageCircle;
  readonly visible = signal(false);
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const result = this.route.snapshot.queryParamMap.get('discord');
    if (result === 'failed') this.message.set('BETA_DISCORD.FAILED');
    try {
      const status = await this.discord.status();
      if (result === 'connected') {
        this.message.set(status.linked ? 'BETA_DISCORD.CONNECTED' : 'BETA_DISCORD.FAILED');
      }
      this.visible.set(status.eligible && status.configured && !status.linked);
    } catch {
      // Discord ist freiwillig. Ein Ausfall darf das Dashboard nicht blockieren.
    }
  }

  async connect(): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      window.location.assign(await this.discord.authorizationUrl());
    } catch {
      this.message.set('BETA_DISCORD.START_FAILED');
      this.busy.set(false);
    }
  }
}
