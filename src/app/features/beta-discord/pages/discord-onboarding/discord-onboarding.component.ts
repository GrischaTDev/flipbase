import { NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { BetaRegistrationProgressComponent } from '../../../onboarding/components/beta-registration-progress/beta-registration-progress.component';
import { BetaDiscordService, BetaDiscordStatus } from '../../services/beta-discord.service';

@Component({
  selector: 'app-discord-onboarding',
  imports: [NgOptimizedImage, TranslatePipe, ButtonComponent, BetaRegistrationProgressComponent],
  templateUrl: './discord-onboarding.component.html',
  host: { class: 'block fb-admin' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscordOnboardingComponent implements OnInit {
  private readonly discord = inject(BetaDiscordService);
  private readonly route = inject(ActivatedRoute);

  readonly status = signal<BetaDiscordStatus | null>(null);
  readonly loading = signal(true);
  readonly connecting = signal(false);
  readonly message = signal<string | null>(null);
  readonly serverUrl = computed(() => {
    const guildId = this.status()?.guildId;
    return guildId && /^\d{17,22}$/u.test(guildId)
      ? `https://discord.com/channels/${guildId}`
      : null;
  });

  async ngOnInit(): Promise<void> {
    await this.loadStatus();
  }

  async loadStatus(): Promise<void> {
    this.loading.set(true);
    this.message.set(null);
    try {
      const status = await this.discord.status();
      this.status.set(status);
      const result = this.route.snapshot.queryParamMap.get('discord');
      if (result === 'failed' || (result === 'connected' && !status.linked)) {
        this.message.set('BETA_DISCORD.FAILED');
      }
    } catch {
      this.message.set('BETA_ONBOARDING.DISCORD_UNAVAILABLE');
    } finally {
      this.loading.set(false);
    }
  }

  async connect(): Promise<void> {
    this.connecting.set(true);
    this.message.set(null);
    try {
      window.location.assign(await this.discord.authorizationUrl());
    } catch {
      this.message.set('BETA_DISCORD.START_FAILED');
      this.connecting.set(false);
    }
  }
}
