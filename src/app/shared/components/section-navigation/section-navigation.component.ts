import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface SectionNavigationLink {
  readonly label: string;
  readonly path: string;
}

@Component({
  selector: 'app-section-navigation',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './section-navigation.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionNavigationComponent {
  readonly label = input.required<string>();
  readonly links = input.required<readonly SectionNavigationLink[]>();
}
