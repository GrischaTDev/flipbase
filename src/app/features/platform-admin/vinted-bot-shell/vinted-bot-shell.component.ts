import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SniperAdminState } from '../services/sniper-admin-state';

/** Gemeinsame Botfläche; Filter und Betrieb benötigen keine zweite Seitenleiste. */
@Component({
  selector: 'app-vinted-bot-shell',
  imports: [RouterOutlet],
  templateUrl: './vinted-bot-shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SniperAdminState],
  host: { class: 'block min-w-0' },
})
export class VintedBotShellComponent {}
