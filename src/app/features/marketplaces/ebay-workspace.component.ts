import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-ebay-workspace',
  imports: [RouterOutlet],
  templateUrl: './ebay-workspace.component.html',
  host: { class: 'block min-w-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EbayWorkspaceComponent {}
