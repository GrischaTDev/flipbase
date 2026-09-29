import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface RouteTab {
  readonly id: string;
  readonly label: string;
  readonly path: string;
}

@Component({
  selector: 'app-route-tabs',
  imports: [RouterLink],
  templateUrl: './route-tabs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class RouteTabsComponent {
  readonly tabs = input.required<readonly RouteTab[]>();
  readonly activeId = input.required<string>();
  readonly label = input('Bereiche');
}
